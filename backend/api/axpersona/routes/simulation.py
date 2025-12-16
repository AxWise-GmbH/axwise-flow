"""
Simulation execution routes for AxPersona.

This module handles simulation execution endpoints.
"""

import logging

from fastapi import APIRouter

from backend.api.research.simulation_bridge.models import (
    SimulationRequest,
    SimulationResponse,
)
from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Shared orchestrator instance
orchestrator = SimulationOrchestrator()


@router.post("/simulations", response_model=SimulationResponse)
async def run_simulation(request: SimulationRequest) -> SimulationResponse:
    """Run synthetic interview simulation using SimulationOrchestrator.

    Input:
        SimulationRequest with business context and questions data.

    Output:
        SimulationResponse with simulation ID and results.
    """
    return await orchestrator.run_simulation(request)

