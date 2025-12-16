"""
Export routes for AxPersona.

This module handles data export endpoints for persona datasets.
"""

import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.domain.models.production_persona import (
    ProductionPersona,
    PersonaTrait,
)
from backend.schemas import DetailedAnalysisResult
from backend.services.adapters.persona_adapters import from_ssot_to_frontend

logger = logging.getLogger(__name__)

router = APIRouter()


class PersonaDatasetExportRequest(BaseModel):
    """Request model for persona dataset export."""

    analysis_id: str
    include_visual_assets: bool = False


class AxPersonaDataset(BaseModel):
    """Complete persona dataset for export."""

    scope_id: str
    scope_name: str
    description: str
    personas: List[Dict[str, Any]]
    interviews: List[Dict[str, Any]]
    analysis: DetailedAnalysisResult
    quality: Dict[str, Any]
    simulation_people: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/exports/persona-dataset", response_model=AxPersonaDataset)
async def export_persona_dataset(
    request: PersonaDatasetExportRequest,
) -> AxPersonaDataset:
    """Export a production-ready persona dataset for axpersona.com.

    Input:
        PersonaDatasetExportRequest with analysis_id.

    Output:
        AxPersonaDataset containing personas, interviews, analysis, and quality metrics.
    """
    from backend.api.axpersona.helpers import load_analysis, resolve_simulation

    if not request.analysis_id:
        raise HTTPException(
            status_code=400,
            detail="analysis_id is required to export a persona dataset",
        )

    loaded = await load_analysis(request.analysis_id)
    analysis: DetailedAnalysisResult = loaded["analysis"]
    simulation_id: Optional[str] = loaded.get("simulation_id")

    # Recover the originating simulation
    interviews: List[Dict[str, Any]] = []
    simulation_people: List[Dict[str, Any]] = []
    if simulation_id:
        try:
            simulation = await resolve_simulation(simulation_id)
            interviews = [
                i if isinstance(i, dict) else i.model_dump()
                for i in (simulation.interviews or [])
            ]
            simulation_people = [
                p if isinstance(p, dict) else p.model_dump()
                for p in (simulation.people or [])
            ]
        except HTTPException:
            logger.warning(
                "Simulation %s referenced by analysis %s could not be loaded",
                simulation_id,
                analysis.id,
            )

    # Choose the best available personas
    persona_sources = (
        analysis.enhanced_personas
        if analysis.enhanced_personas
        else (analysis.personas or [])
    )

    production_personas = _build_production_personas(
        persona_sources, analysis.id, simulation_id
    )
    personas_frontend = [p.to_frontend_dict() for p in production_personas]

    # Quality metrics
    interview_count = len(interviews)
    stakeholder_types = {
        i.get("stakeholder_type") for i in interviews if isinstance(i, dict)
    }
    stakeholder_coverage = len({s for s in stakeholder_types if s})
    avg_persona_quality = (
        sum(p.overall_confidence for p in production_personas) / len(production_personas)
        if production_personas
        else 0.0
    )

    scope_id = str(uuid.uuid4())
    scope_name = f"AxPersona Scope {analysis.id}"
    description = (
        f"Persona dataset generated from analysis {analysis.id}"
        + (f" (simulation {simulation_id})" if simulation_id else "")
    )

    return AxPersonaDataset(
        scope_id=scope_id,
        scope_name=scope_name,
        description=description,
        personas=personas_frontend,
        interviews=interviews,
        analysis=analysis,
        quality={
            "interview_count": interview_count,
            "stakeholder_coverage": stakeholder_coverage,
            "avg_persona_quality": avg_persona_quality,
        },
        simulation_people=simulation_people,
    )


def _build_production_personas(
    persona_sources: List[Any],
    analysis_id: str,
    simulation_id: Optional[str],
) -> List[ProductionPersona]:
    """Build production personas from analysis persona sources."""
    production_personas: List[ProductionPersona] = []

    for persona in persona_sources:
        if hasattr(persona, "model_dump"):
            persona_dict = persona.model_dump()
        else:
            persona_dict = persona

        ssot_frontend = from_ssot_to_frontend(persona_dict)

        production_personas.append(
            ProductionPersona(
                name=ssot_frontend.get("name", "Unnamed Persona"),
                description=ssot_frontend.get("description") or ssot_frontend.get("name", ""),
                archetype=ssot_frontend.get("archetype", ""),
                demographics=_to_persona_trait(ssot_frontend.get("demographics")),
                goals_and_motivations=_to_persona_trait(ssot_frontend.get("goals_and_motivations")),
                challenges_and_frustrations=_to_persona_trait(ssot_frontend.get("challenges_and_frustrations")),
                key_quotes=_to_persona_trait(ssot_frontend.get("key_quotes")),
                overall_confidence=float(persona_dict.get("overall_confidence", 0.7)),
                patterns=persona_dict.get("patterns", []),
                persona_metadata={
                    "source": "axpersona_pipeline",
                    "analysis_id": analysis_id,
                    "simulation_id": simulation_id,
                },
            )
        )

    return production_personas


def _to_persona_trait(frontend_trait: Optional[Dict[str, Any]]) -> PersonaTrait:
    """Convert frontend trait dict to PersonaTrait model."""
    if not isinstance(frontend_trait, dict):
        return PersonaTrait(value="", confidence=0.7, evidence=[])
    return PersonaTrait(
        value=(frontend_trait.get("value") or "").strip(),
        confidence=float(frontend_trait.get("confidence", 0.7)),
        evidence=frontend_trait.get("evidence") or [],
    )

