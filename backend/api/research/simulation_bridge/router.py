"""
FastAPI router for the Simulation Bridge system.
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from .models import SimulationRequest, SimulationResponse, SimulationProgress
from .services.orchestrator import SimulationOrchestrator

logger = logging.getLogger(__name__)

# Router
router = APIRouter(
    prefix="/api/research/simulation-bridge",
    tags=["Simulation Bridge"],
)

# Global orchestrator instance
orchestrator = SimulationOrchestrator()


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "simulation-bridge"}


@router.post("/simulate", response_model=SimulationResponse)
async def create_simulation(
    request: SimulationRequest, background_tasks: BackgroundTasks
) -> SimulationResponse:
    """
    Create and run a complete interview simulation.

    This endpoint:
    1. Generates AI personas based on business context
    2. Simulates interviews with those personas
    3. Formats the results for analysis pipeline
    4. Returns comprehensive simulation data
    """
    try:
        logger.info("Starting new simulation request")

        # Validate request
        if not request.questions_data.stakeholders:
            raise HTTPException(
                status_code=400, detail="No stakeholders provided in questions data"
            )

        if not request.business_context.business_idea:
            raise HTTPException(
                status_code=400, detail="Business idea is required for simulation"
            )

        # Run simulation
        response = await orchestrator.run_simulation(request)

        if not response.success:
            raise HTTPException(status_code=500, detail=response.message)

        logger.info(f"Simulation completed successfully: {response.simulation_id}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simulation request failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.get("/simulate/{simulation_id}/progress")
async def get_simulation_progress(simulation_id: str) -> Dict[str, Any]:
    """
    Get the progress of a running simulation.
    """
    try:
        progress = orchestrator.get_simulation_progress(simulation_id)

        if not progress:
            raise HTTPException(
                status_code=404, detail="Simulation not found or completed"
            )

        return {
            "simulation_id": progress.simulation_id,
            "stage": progress.stage,
            "progress_percentage": progress.progress_percentage,
            "current_task": progress.current_task,
            "estimated_time_remaining": progress.estimated_time_remaining,
            "completed_personas": progress.completed_personas,
            "total_personas": progress.total_personas,
            "completed_interviews": progress.completed_interviews,
            "total_interviews": progress.total_interviews,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get simulation progress: {str(e)}")
        raise HTTPException(
            status_code=500, detail="Failed to retrieve simulation progress"
        )


@router.delete("/simulate/{simulation_id}")
async def cancel_simulation(simulation_id: str) -> Dict[str, Any]:
    """
    Cancel a running simulation.
    """
    try:
        success = orchestrator.cancel_simulation(simulation_id)

        if not success:
            raise HTTPException(
                status_code=404, detail="Simulation not found or already completed"
            )

        return {
            "message": "Simulation cancelled successfully",
            "simulation_id": simulation_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel simulation: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel simulation")


@router.post("/test-personas")
async def test_persona_generation(
    business_context: Dict[str, Any],
    stakeholder_info: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Test endpoint for persona generation only.
    Useful for debugging and development.
    """
    try:
        import os
        from pydantic_ai.models.gemini import GeminiModel
        from .models import BusinessContext, Stakeholder, SimulationConfig
        from .services.persona_generator import PersonaGenerator

        # Convert to proper models
        business_ctx = BusinessContext(**business_context)
        stakeholder = Stakeholder(**stakeholder_info)
        sim_config = SimulationConfig(**(config or {}))

        # Generate personas
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

        model = GeminiModel("gemini-2.0-flash-exp")
        generator = PersonaGenerator(model)
        personas = await generator.generate_personas(
            stakeholder, business_ctx, sim_config
        )

        return {
            "success": True,
            "personas": [persona.dict() for persona in personas],
            "count": len(personas),
        }

    except Exception as e:
        logger.error(f"Persona generation test failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Persona generation failed: {str(e)}"
        )


@router.post("/test-interview")
async def test_interview_simulation(
    persona_data: Dict[str, Any],
    stakeholder_info: Dict[str, Any],
    business_context: Dict[str, Any],
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Test endpoint for interview simulation only.
    Useful for debugging and development.
    """
    try:
        from .models import AIPersona, BusinessContext, Stakeholder, SimulationConfig
        from .services.interview_simulator import InterviewSimulator

        # Convert to proper models
        persona = AIPersona(**persona_data)
        business_ctx = BusinessContext(**business_context)
        stakeholder = Stakeholder(**stakeholder_info)
        sim_config = SimulationConfig(**(config or {}))

        # Simulate interview
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

        model = GeminiModel("gemini-2.0-flash-exp")
        simulator = InterviewSimulator(model)
        interview = await simulator.simulate_interview(
            persona, stakeholder, business_ctx, sim_config
        )

        return {
            "success": True,
            "interview": interview.dict(),
            "response_count": len(interview.responses),
        }

    except Exception as e:
        logger.error(f"Interview simulation test failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Interview simulation failed: {str(e)}"
        )


@router.get("/config/defaults")
async def get_default_config() -> Dict[str, Any]:
    """
    Get default simulation configuration.
    """
    from .models import SimulationConfig

    default_config = SimulationConfig()
    return {
        "default_config": default_config.dict(),
        "available_options": {
            "depth": ["quick", "detailed", "comprehensive"],
            "response_style": ["realistic", "optimistic", "critical", "mixed"],
            "personas_per_stakeholder": {"min": 1, "max": 5, "default": 2},
            "temperature": {"min": 0.0, "max": 1.0, "default": 0.7},
        },
    }
