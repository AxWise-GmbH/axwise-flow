"""
Helper functions for AxPersona routes.

This module contains shared helper functions used across AxPersona route modules.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.api.research.simulation_bridge.models import SimulationResponse
from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)
from backend.database import SessionLocal
from backend.infrastructure.persistence.simulation_repository import (
    SimulationRepository,
)
from backend.infrastructure.persistence.unit_of_work import UnitOfWork
from backend.models import AnalysisResult
from backend.schemas import DetailedAnalysisResult

logger = logging.getLogger(__name__)

# Shared orchestrator instance
orchestrator = SimulationOrchestrator(use_parallel=True, max_concurrent=12)


async def resolve_simulation(simulation_id: str) -> SimulationResponse:
    """Resolve a completed simulation either from orchestrator cache or DB."""
    # Try in-memory cache first
    cached = orchestrator.get_completed_simulation(simulation_id)
    if cached is not None:
        return cached

    # Fallback to persisted simulation in the database
    async with UnitOfWork(SessionLocal) as uow:
        repo = SimulationRepository(uow.session)
        db_simulation = await repo.get_by_simulation_id(simulation_id)

        if not db_simulation:
            raise HTTPException(
                status_code=404,
                detail=f"Simulation {simulation_id} not found in memory or database",
            )

        return SimulationResponse(
            success=True,
            message="Simulation loaded from database",
            simulation_id=db_simulation.simulation_id,
            data=db_simulation.formatted_data or {},
            metadata={
                "total_personas": db_simulation.total_personas,
                "total_interviews": db_simulation.total_interviews,
                "status": db_simulation.status,
                "created_at": db_simulation.created_at.isoformat()
                if getattr(db_simulation, "created_at", None)
                else None,
                "completed_at": db_simulation.completed_at.isoformat()
                if getattr(db_simulation, "completed_at", None)
                else None,
            },
            people=db_simulation.personas or [],
            interviews=db_simulation.interviews or [],
            simulation_insights=db_simulation.insights,
        )


def build_simulation_text(simulation: SimulationResponse) -> str:
    """Build a single analysis string from simulation data."""
    data = simulation.data or {}
    analysis_ready_text = data.get("analysis_ready_text")
    if isinstance(analysis_ready_text, str) and analysis_ready_text.strip():
        return analysis_ready_text

    # Fallback: build a simple interview transcript
    interviews = simulation.interviews or []
    personas = simulation.personas or []

    parts: List[str] = []

    for interview in interviews:
        persona_name = "Unknown"
        if hasattr(interview, "persona_id"):
            persona_id = interview.persona_id
        else:
            persona_id = getattr(interview, "person_id", None)

        for persona in personas:
            if getattr(persona, "id", None) == persona_id:
                persona_name = getattr(persona, "name", "Unknown")
                break

        stakeholder_type = getattr(interview, "stakeholder_type", "Unknown")

        parts.append(f"=== Interview with {persona_name} ({stakeholder_type}) ===")
        parts.append(f"Overall Sentiment: {getattr(interview, 'overall_sentiment', 'unknown')}")
        key_themes = getattr(interview, "key_themes", []) or []
        if key_themes:
            parts.append(f"Key Themes: {', '.join(key_themes)}")
        parts.append("")

        responses = getattr(interview, "responses", []) or []
        for i, response in enumerate(responses, 1):
            question = getattr(response, "question", "")
            answer = getattr(response, "response", "")
            parts.append(f"Q{i}: {question}")
            parts.append(f"A{i}: {answer}")
            parts.append("")

    return "\n".join(parts)


async def save_analysis_result(
    analysis_result: DetailedAnalysisResult,
    simulation_id: str,
) -> DetailedAnalysisResult:
    """Persist analysis results to the AnalysisResult table."""
    try:
        analysis_data = _build_analysis_data(analysis_result, simulation_id)

        db = SessionLocal()
        try:
            db_analysis = AnalysisResult(
                data_id=None,
                analysis_date=datetime.utcnow(),
                completed_at=datetime.utcnow(),
                results=json.dumps(analysis_data),
                llm_provider="gemini",
                llm_model="gemini-2.5-pro",
                status=analysis_result.status,
                error_message=analysis_result.error,
            )

            db.add(db_analysis)
            db.commit()
            db.refresh(db_analysis)

            analysis_result.id = str(db_analysis.result_id)
            logger.info(
                "Saved analysis for simulation %s as AnalysisResult %s",
                simulation_id,
                db_analysis.result_id,
            )
        finally:
            db.close()
    except Exception as exc:
        logger.error(
            "Database save failed for analysis of simulation %s: %s",
            simulation_id,
            exc,
        )

    return analysis_result


def _build_analysis_data(
    analysis_result: DetailedAnalysisResult, simulation_id: str
) -> Dict[str, Any]:
    """Build analysis data dictionary for persistence."""
    return {
        "id": analysis_result.id,
        "simulation_id": simulation_id,
        "status": analysis_result.status,
        "created_at": analysis_result.createdAt,
        "file_name": analysis_result.fileName,
        "file_size": analysis_result.fileSize,
        "themes": [
            theme.dict() if hasattr(theme, "dict") else theme
            for theme in analysis_result.themes
        ],
        "patterns": [
            pattern.dict() if hasattr(pattern, "dict") else pattern
            for pattern in analysis_result.patterns
        ],
        "personas": [
            persona.dict() if hasattr(persona, "dict") else persona
            for persona in (analysis_result.personas or [])
        ],
        "insights": [
            insight.dict() if hasattr(insight, "dict") else insight
            for insight in (analysis_result.insights or [])
        ],
        "error": analysis_result.error,
    }


async def load_analysis(analysis_id: str) -> Dict[str, Any]:
    """Load analysis result and associated simulation_id from the database."""
    try:
        db = SessionLocal()
        try:
            db_analysis = (
                db.query(AnalysisResult)
                .filter(AnalysisResult.result_id == int(analysis_id))
                .first()
            )
            if not db_analysis:
                raise HTTPException(
                    status_code=404,
                    detail=f"Analysis {analysis_id} not found",
                )

            raw = db_analysis.results or "{}"
            analysis_data = json.loads(raw)

            simulation_id = analysis_data.get("simulation_id")

            detailed = DetailedAnalysisResult(
                id=str(analysis_id),
                status=db_analysis.status,
                createdAt=analysis_data.get(
                    "created_at",
                    db_analysis.analysis_date.isoformat()
                    if db_analysis.analysis_date
                    else datetime.utcnow().isoformat(),
                ),
                fileName=analysis_data.get("file_name", "simulation_analysis.txt"),
                fileSize=analysis_data.get("file_size", len(raw.encode("utf-8"))),
                themes=analysis_data.get("themes", []),
                enhanced_themes=analysis_data.get("enhanced_themes", []),
                patterns=analysis_data.get("patterns", []),
                enhanced_patterns=analysis_data.get("enhanced_patterns", []),
                sentimentOverview=analysis_data.get("sentiment_overview"),
                sentiment=analysis_data.get("sentiment", []),
                personas=analysis_data.get("personas", []),
                enhanced_personas=analysis_data.get("enhanced_personas", []),
                insights=analysis_data.get("insights", []),
                enhanced_insights=analysis_data.get("enhanced_insights", []),
                stakeholder_intelligence=analysis_data.get("stakeholder_intelligence"),
                error=analysis_data.get("error") or db_analysis.error_message,
            )

            return {"analysis": detailed, "simulation_id": simulation_id}
        finally:
            db.close()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to load analysis %s from database: %s", analysis_id, exc
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load analysis {analysis_id} from database",
        )


async def execute_pipeline(
    context: Any, pipeline_id: Optional[str] = None
) -> Any:
    """Execute the full AxPersona pipeline.

    This is a placeholder that delegates to the original _execute_pipeline function.
    """
    # Import here to avoid circular imports
    from backend.api.axpersona.router import _execute_pipeline
    return await _execute_pipeline(context, pipeline_id)

