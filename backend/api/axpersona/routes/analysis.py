"""
Analysis routes for AxPersona.

This module handles analysis and persona generation endpoints.
Uses the proven NLPProcessor pipeline for reliable analysis.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from backend.schemas import DetailedAnalysisResult

logger = logging.getLogger(__name__)

router = APIRouter()


def _simulation_to_nlp_format(simulation) -> Dict[str, Any]:
    """Convert SimulationResponse to the format expected by NLPProcessor.

    The NLPProcessor expects the 'enhanced simulation format':
    {
        "interviews": [
            {
                "responses": [
                    {"question": "...", "response": "..."},
                    ...
                ]
            },
            ...
        ],
        "metadata": {...}
    }
    """
    interviews_data = []

    simulation_interviews = simulation.interviews or []
    simulation_people = simulation.people or simulation.personas or []

    for interview in simulation_interviews:
        # Get person info for this interview
        person_id = getattr(interview, "person_id", None) or getattr(interview, "persona_id", None)
        person_name = "Unknown"
        for person in simulation_people:
            if getattr(person, "id", None) == person_id:
                person_name = getattr(person, "name", "Unknown")
                break

        stakeholder_type = getattr(interview, "stakeholder_type", "Unknown")

        # Convert responses
        responses_data = []
        for resp in getattr(interview, "responses", []) or []:
            responses_data.append({
                "question": getattr(resp, "question", ""),
                "response": getattr(resp, "response", ""),
                "answer": getattr(resp, "response", ""),  # NLPProcessor also checks 'answer'
            })

        interviews_data.append({
            "person_id": person_id,
            "person_name": person_name,
            "stakeholder_type": stakeholder_type,
            "responses": responses_data,
            "overall_sentiment": getattr(interview, "overall_sentiment", "neutral"),
            "key_themes": getattr(interview, "key_themes", []) or [],
        })

    return {
        "interviews": interviews_data,
        "metadata": {
            "simulation_id": simulation.simulation_id,
            "total_interviews": len(interviews_data),
            "source": "axpersona_simulation",
        }
    }


def _transform_personas_to_schema(raw_personas: List[Dict[str, Any]]) -> List[Any]:
    """Transform raw persona dicts to proper Persona schema objects.

    The NLP processor may return personas with demographics in the legacy
    {value, confidence, evidence} format, but the DetailedAnalysisResult
    expects StructuredDemographics with proper AttributedField structure.

    This function uses map_json_to_persona_schema to handle the conversion.
    """
    from backend.services.results.persona_transformers import map_json_to_persona_schema

    if not raw_personas:
        return []

    transformed = []
    for p_data in raw_personas:
        if not isinstance(p_data, dict):
            # Already a Pydantic model or other type, try to use as-is
            transformed.append(p_data)
            continue

        try:
            persona = map_json_to_persona_schema(p_data)
            transformed.append(persona)
        except Exception as e:
            logger.warning(f"Failed to transform persona '{p_data.get('name', 'Unknown')}': {e}")
            # Skip this persona rather than fail the entire analysis
            continue

    logger.info(f"Transformed {len(transformed)}/{len(raw_personas)} personas to schema")
    return transformed


def _nlp_result_to_detailed_analysis(
    nlp_result: Dict[str, Any],
    simulation_id: str,
) -> DetailedAnalysisResult:
    """Convert NLPProcessor result to DetailedAnalysisResult schema."""
    now_iso = datetime.now(timezone.utc).isoformat()

    # Transform personas to proper schema format
    raw_personas = nlp_result.get("personas", [])
    raw_enhanced_personas = nlp_result.get("enhanced_personas", [])

    transformed_personas = _transform_personas_to_schema(raw_personas)
    transformed_enhanced_personas = _transform_personas_to_schema(raw_enhanced_personas)

    return DetailedAnalysisResult(
        id=simulation_id,
        status="completed",
        createdAt=now_iso,
        fileName="simulation_analysis.txt",
        fileSize=0,
        themes=nlp_result.get("themes", []),
        enhanced_themes=nlp_result.get("enhanced_themes", []),
        patterns=nlp_result.get("patterns", []),
        enhanced_patterns=nlp_result.get("enhanced_patterns", []),
        sentimentOverview=nlp_result.get("sentimentOverview", {
            "positive": 0.33,
            "neutral": 0.34,
            "negative": 0.33,
        }),
        sentiment=nlp_result.get("sentiment", []),
        personas=transformed_personas,
        enhanced_personas=transformed_enhanced_personas,
        insights=nlp_result.get("insights", []),
        enhanced_insights=nlp_result.get("enhanced_insights", []),
        error=None,
    )


@router.post("/analysis", response_model=DetailedAnalysisResult)
async def run_analysis(simulation_id: str) -> DetailedAnalysisResult:
    """Run analysis for a completed simulation using the proven NLPProcessor pipeline.

    Input:
        simulation_id: identifier returned by run_simulation.

    Processing:
        - Resolves the simulation via resolve_simulation
        - Converts simulation data to NLPProcessor format
        - Runs analysis through the proven NLPProcessor pipeline
        - Persists the analysis via save_analysis_result

    Output:
        DetailedAnalysisResult with structured themes, patterns, personas,
        insights and stakeholder_intelligence.
    """
    from backend.api.axpersona.helpers import (
        resolve_simulation,
        save_analysis_result,
    )
    from backend.core.processing_pipeline import process_data
    from backend.services.nlp.processor import NLPProcessor
    from backend.services.llm.gemini_service import GeminiService

    logger.info(f"[AxPersona Analysis] Starting analysis for simulation: {simulation_id}")

    # 1) Resolve simulation
    simulation = await resolve_simulation(simulation_id)

    # Check we have interview content
    if not simulation.interviews:
        raise HTTPException(
            status_code=400,
            detail="Simulation contains no interview content to analyse",
        )

    logger.info(f"[AxPersona Analysis] Found {len(simulation.interviews)} interviews")

    # 2) Convert simulation to NLPProcessor format
    nlp_data = _simulation_to_nlp_format(simulation)

    logger.info(
        f"[AxPersona Analysis] Converted to NLP format: "
        f"{len(nlp_data['interviews'])} interviews"
    )

    # 3) Run through proven NLPProcessor pipeline
    try:
        nlp_processor = NLPProcessor()
        # GeminiService requires a config dict with model settings
        gemini_config = {
            "model": "models/gemini-3-flash-preview",
            "temperature": 0.7,
            "max_tokens": 16000,
        }
        llm_service = GeminiService(gemini_config)

        config = {
            "use_enhanced_theme_analysis": True,
            "use_reliability_check": True,
            "industry": simulation.metadata.get("industry") if simulation.metadata else None,
        }

        nlp_result = await process_data(
            nlp_processor=nlp_processor,
            llm_service=llm_service,
            data=nlp_data,
            config=config,
            progress_callback=None,
        )

        logger.info(
            f"[AxPersona Analysis] NLPProcessor completed: "
            f"{len(nlp_result.get('themes', []))} themes, "
            f"{len(nlp_result.get('patterns', []))} patterns, "
            f"{len(nlp_result.get('personas', []))} personas"
        )

    except Exception as e:
        logger.exception(f"[AxPersona Analysis] Pipeline failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Analysis pipeline failed: {str(e)}",
        )

    # 4) Convert to DetailedAnalysisResult
    result = _nlp_result_to_detailed_analysis(nlp_result, simulation_id)

    # 5) Persist analysis
    result = await save_analysis_result(result, simulation_id=simulation_id)

    logger.info(f"[AxPersona Analysis] Analysis saved with id: {result.id}")

    return result

