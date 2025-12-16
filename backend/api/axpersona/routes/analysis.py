"""
Analysis routes for AxPersona.

This module handles analysis and persona generation endpoints.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from backend.api.research.simulation_bridge.services.conversational_analysis_agent import (
    ConversationalAnalysisAgent,
)
from backend.schemas import DetailedAnalysisResult

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared analysis agent instance
analysis_agent = ConversationalAnalysisAgent()


@router.post("/analysis", response_model=DetailedAnalysisResult)
async def run_analysis(simulation_id: str) -> DetailedAnalysisResult:
    """Run conversational analysis for a completed simulation.

    Input:
        simulation_id: identifier returned by run_simulation.

    Processing:
        - Resolves the simulation via _resolve_simulation
        - Builds analysis text with _build_simulation_text
        - Calls ConversationalAnalysisAgent.process_simulation_data
        - Persists the analysis via _save_analysis_result

    Output:
        DetailedAnalysisResult with structured themes, patterns, personas,
        insights and stakeholder_intelligence.
    """
    from backend.api.axpersona.helpers import (
        resolve_simulation,
        build_simulation_text,
        save_analysis_result,
    )

    # 1) Resolve simulation and build full analysis text
    simulation = await resolve_simulation(simulation_id)
    simulation_text = build_simulation_text(simulation)

    if not simulation_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Simulation contains no interview content to analyse",
        )

    # 2) Run conversational analysis using the shared agent
    result = await analysis_agent.process_simulation_data(
        simulation_text=simulation_text,
        simulation_id=simulation_id,
        file_name="simulation_analysis.txt",
    )

    if result.error:
        raise HTTPException(
            status_code=502,
            detail=f"Analysis failed: {result.error}",
        )

    # 3) Persist analysis and expose numeric analysis_id to callers
    result = await save_analysis_result(result, simulation_id=simulation_id)

    return result

