"""
FastAPI router for the Simulation Bridge system.
"""

import logging
import os
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse

from .models import (
    SimulationRequest,
    SimulationResponse,
    SimulationProgress,
    BusinessContext,
    Stakeholder,
    SimulationConfig,
    AIPersona,
    QuestionsData,
)
from .services.orchestrator import SimulationOrchestrator
from .services.persona_generator import PersonaGenerator
from .services.interview_simulator import InterviewSimulator
from pydantic_ai.models.gemini import GeminiModel

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


@router.post("/debug-request")
async def debug_request(request: Request):
    """Debug endpoint to see raw request data"""
    try:
        body = await request.body()
        json_data = await request.json()

        logger.info(f"🔍 Debug - Raw body: {body}")
        logger.info(f"🔍 Debug - JSON data: {json_data}")
        logger.info(f"🔍 Debug - Headers: {dict(request.headers)}")

        return {
            "success": True,
            "body_length": len(body),
            "json_keys": (
                list(json_data.keys()) if isinstance(json_data, dict) else "not_dict"
            ),
            "data": json_data,
        }
    except Exception as e:
        logger.error(f"Debug request failed: {str(e)}")
        return {"success": False, "error": str(e)}


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

        # Handle raw questionnaire content with PydanticAI parsing
        if request.raw_questionnaire_content:
            logger.info("Processing raw questionnaire content with PydanticAI")
            # Parse questionnaire using PydanticAI - delegate to orchestrator
            parsed_request = await orchestrator.parse_raw_questionnaire(
                request.raw_questionnaire_content, request.config
            )
            # Update request with parsed data
            request.questions_data = parsed_request.questions_data
            request.business_context = parsed_request.business_context

        # Validate request
        if not request.questions_data or not request.questions_data.stakeholders:
            raise HTTPException(
                status_code=400, detail="No stakeholders provided in questions data"
            )

        if not request.business_context or not request.business_context.business_idea:
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


@router.get("/completed")
async def list_completed_simulations() -> Dict[str, Any]:
    """
    List all completed simulations.
    """
    try:
        completed = orchestrator.list_completed_simulations()
        return {"success": True, "simulations": completed, "count": len(completed)}
    except Exception as e:
        logger.error(f"Failed to list completed simulations: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list simulations: {str(e)}"
        )


@router.get("/completed/{simulation_id}")
async def get_completed_simulation(simulation_id: str) -> SimulationResponse:
    """
    Get a completed simulation result by ID.
    """
    try:
        result = orchestrator.get_completed_simulation(simulation_id)

        if not result:
            raise HTTPException(
                status_code=404, detail="Completed simulation not found"
            )

        logger.info(f"Retrieved completed simulation: {simulation_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get completed simulation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get simulation: {str(e)}"
        )


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

        # Convert to proper models
        business_ctx = BusinessContext(**business_context)
        stakeholder = Stakeholder(**stakeholder_info)
        sim_config = SimulationConfig(**(config or {}))

        # Generate personas
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

        model = GeminiModel("gemini-2.5-flash")
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

        # Convert to proper models
        persona = AIPersona(**persona_data)
        business_ctx = BusinessContext(**business_context)
        stakeholder = Stakeholder(**stakeholder_info)
        sim_config = SimulationConfig(**(config or {}))

        # Simulate interview
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

        model = GeminiModel("gemini-2.5-flash")
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


@router.post("/generate-personas")
async def generate_personas_for_chat(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate personas for chat simulation.
    Generates one persona per stakeholder type for interactive chat.
    """
    try:

        # Parse request data
        questions_data = QuestionsData(**request.get("questions_data", {}))
        business_context = BusinessContext(**request.get("business_context", {}))
        config = SimulationConfig(**request.get("config", {}))

        # Generate personas using orchestrator with global name uniqueness for chat
        personas = await orchestrator.persona_generator.generate_all_personas(
            questions_data.stakeholders,
            business_context,
            config,
            global_name_uniqueness=True,
        )

        return {
            "success": True,
            "personas": [persona.dict() for persona in personas],
            "count": len(personas),
        }

    except Exception as e:
        logger.error(f"Persona generation for chat failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Persona generation failed: {str(e)}"
        )


@router.post("/simulate-response")
async def simulate_single_response(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Simulate a single response from a persona to a question.
    Used for real-time chat simulation.
    """
    try:

        # Parse request data
        question = request.get("question", "")
        persona_data = request.get("persona_data", {})
        business_context_data = request.get("business_context", {})
        config = request.get("config", {})

        # Convert to proper models
        persona = AIPersona(**persona_data)
        business_context = BusinessContext(**business_context_data)

        # Get API key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

        # Initialize simulator
        model = GeminiModel("gemini-2.5-flash")
        simulator = InterviewSimulator(model)

        # Generate single response
        response = await simulator.generate_single_response(
            question, persona, business_context, config
        )

        return {
            "success": True,
            "response": response,
            "persona_id": persona.id,
            "question": question,
        }

    except Exception as e:
        logger.error(f"Single response simulation failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Response simulation failed: {str(e)}"
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
