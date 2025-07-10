"""
FastAPI router for the Simulation Bridge system.
"""

import logging
import os
import json
import asyncio
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from fastapi.responses import JSONResponse, StreamingResponse

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

# Global orchestrator instance with enhanced capabilities
orchestrator = SimulationOrchestrator(use_parallel=True, max_concurrent=5)


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

        # Run simulation with database persistence
        response = await orchestrator.simulate_with_persistence(
            request, user_id="anonymous"
        )

        if not response.success:
            raise HTTPException(status_code=500, detail=response.message)

        logger.info(f"Simulation completed successfully: {response.simulation_id}")
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Simulation request failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.post("/simulate-enhanced")
async def simulate_interviews_enhanced(
    request: SimulationRequest,
    user_id: str = "anonymous",  # In production, extract from auth token
) -> SimulationResponse:
    """
    Enhanced simulation endpoint with database persistence and parallel processing.

    This endpoint provides:
    1. Database persistence for simulation results
    2. Parallel interview processing for better performance
    3. Enhanced error handling and recovery
    4. Progress tracking with detailed metrics
    """
    try:
        logger.info("Starting enhanced simulation request")

        # Handle raw questionnaire content with PydanticAI parsing
        if request.raw_questionnaire_content:
            logger.info("Processing raw questionnaire content with PydanticAI")
            parsed_request = await orchestrator.parse_raw_questionnaire(
                request.raw_questionnaire_content, request.config
            )
            request.questions_data = parsed_request.questions_data
            request.business_context = parsed_request.business_context

        # Validate required data
        if not request.questions_data or not request.business_context:
            raise HTTPException(
                status_code=400,
                detail="Both questions_data and business_context are required",
            )

        # Use enhanced simulation with persistence and parallel processing
        result = await orchestrator.simulate_with_persistence(request, user_id)

        logger.info(f"Enhanced simulation completed: {result.simulation_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enhanced simulation failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Enhanced simulation failed: {str(e)}"
        )


@router.post("/parse-questionnaire")
async def parse_questionnaire_endpoint(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parse raw questionnaire content using PydanticAI.

    This endpoint takes raw questionnaire text and extracts structured data
    including business context and stakeholder questions.
    """
    try:
        content = request.get("content", "")
        config_data = request.get("config", {})

        if not content:
            raise HTTPException(status_code=400, detail="Content is required")

        # Create simulation config
        from .models import SimulationConfig, SimulationDepth, ResponseStyle

        config = SimulationConfig(
            depth=SimulationDepth(config_data.get("depth", "detailed")),
            people_per_stakeholder=config_data.get("people_per_stakeholder", 5),
            response_style=ResponseStyle(
                config_data.get("response_style", "realistic")
            ),
            include_insights=config_data.get("include_insights", True),
            temperature=config_data.get("temperature", 0.7),
        )

        # Parse using orchestrator
        parsed_request = await orchestrator.parse_raw_questionnaire(content, config)

        return {
            "success": True,
            "message": "Questionnaire parsed successfully",
            "questions_data": parsed_request.questions_data.dict(),
            "business_context": parsed_request.business_context.dict(),
            "config": parsed_request.config.dict(),
        }

    except Exception as e:
        logger.error(f"Questionnaire parsing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")


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
    List all completed simulations from both memory and database.
    """
    try:
        # Get from memory first (for recent simulations)
        memory_completed = orchestrator.list_completed_simulations()

        # Also get from database (for persistent storage)
        from backend.infrastructure.persistence.unit_of_work import UnitOfWork
        from backend.infrastructure.persistence.simulation_repository import (
            SimulationRepository,
        )
        from backend.database import SessionLocal

        db_completed = {}
        try:
            async with UnitOfWork(SessionLocal) as uow:
                simulation_repo = SimulationRepository(uow.session)
                db_simulations = await simulation_repo.get_completed_simulations()

                for sim in db_simulations:
                    db_completed[sim.simulation_id] = {
                        "simulation_id": sim.simulation_id,
                        "success": sim.status == "completed",
                        "message": "Simulation completed successfully",
                        "created_at": (
                            sim.completed_at.isoformat()
                            if sim.completed_at
                            else sim.created_at.isoformat()
                        ),
                        "total_personas": sim.total_personas or 0,
                        "total_interviews": sim.total_interviews or 0,
                        "business_context": sim.business_context,
                    }
        except Exception as db_error:
            logger.warning(f"Failed to fetch from database: {db_error}")

        # Combine both sources (memory takes priority)
        all_completed = {**db_completed, **memory_completed}

        return {
            "success": True,
            "simulations": all_completed,
            "count": len(all_completed),
        }
    except Exception as e:
        logger.error(f"Failed to list completed simulations: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list simulations: {str(e)}"
        )


@router.get("/completed/{simulation_id}")
async def get_completed_simulation(simulation_id: str) -> SimulationResponse:
    """
    Get a completed simulation result by ID from memory or database.
    """
    try:
        # First try to get from memory (for recent simulations)
        result = orchestrator.get_completed_simulation(simulation_id)

        if result:
            logger.info(f"Retrieved completed simulation from memory: {simulation_id}")
            return result

        # If not in memory, try database
        from backend.infrastructure.persistence.unit_of_work import UnitOfWork
        from backend.infrastructure.persistence.simulation_repository import (
            SimulationRepository,
        )
        from backend.database import SessionLocal

        async with UnitOfWork(SessionLocal) as uow:
            simulation_repo = SimulationRepository(uow.session)
            db_simulation = await simulation_repo.get_by_simulation_id(simulation_id)

            if not db_simulation or db_simulation.status != "completed":
                raise HTTPException(
                    status_code=404, detail="Completed simulation not found"
                )

            # Convert database record to SimulationResponse
            response = SimulationResponse(
                success=True,
                message="Simulation completed successfully",
                simulation_id=db_simulation.simulation_id,
                data=db_simulation.formatted_data or {},
                metadata={
                    "total_personas": db_simulation.total_personas or 0,
                    "total_interviews": db_simulation.total_interviews or 0,
                    "created_at": (
                        db_simulation.completed_at.isoformat()
                        if db_simulation.completed_at
                        else db_simulation.created_at.isoformat()
                    ),
                },
                people=db_simulation.personas or [],
                interviews=db_simulation.interviews or [],
                simulation_insights=db_simulation.insights,
                recommendations=[],
            )

            logger.info(
                f"Retrieved completed simulation from database: {simulation_id}"
            )
            return response

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


@router.post("/stream-persona-response")
async def stream_persona_response(request: Dict[str, Any]) -> StreamingResponse:
    """
    Stream a persona response with typing effect.
    """
    try:
        # Parse request data
        persona_data = request.get("persona", {})
        question = request.get("question", "")
        stakeholder_data = request.get("stakeholder", {})
        business_context_data = request.get("business_context", {})
        config_data = request.get("config", {})

        # Convert to proper models
        persona = AIPersona(**persona_data)
        stakeholder = Stakeholder(**stakeholder_data)
        business_context = BusinessContext(**business_context_data)
        config = SimulationConfig(**config_data)

        async def generate_streaming_response():
            """Generate streaming response with typing effect."""
            try:
                # Send start event
                yield f"data: {json.dumps({'type': 'start'})}\n\n"
                await asyncio.sleep(0.1)

                # Create a temporary stakeholder with just this question for the API call
                single_question_stakeholder = Stakeholder(
                    id=stakeholder.id,
                    name=stakeholder.name,
                    description=stakeholder.description,
                    questions=[question],
                )

                # Generate the response using the interview simulator
                result = await orchestrator.interview_simulator.simulate_interview(
                    persona, single_question_stakeholder, business_context, config
                )

                if result.responses and len(result.responses) > 0:
                    response_text = result.responses[0].response

                    # Stream the response word by word for typing effect
                    words = response_text.split()
                    for i, word in enumerate(words):
                        word_with_space = word + (" " if i < len(words) - 1 else "")
                        yield f"data: {json.dumps({'type': 'chunk', 'content': word_with_space})}\n\n"
                        # Vary the delay slightly for more natural typing
                        await asyncio.sleep(0.05 + (0.02 * (len(word) / 10)))
                else:
                    # Fallback response
                    fallback = "I'm not sure how to answer that question."
                    for word in fallback.split():
                        yield f"data: {json.dumps({'type': 'chunk', 'content': word + ' '})}\n\n"
                        await asyncio.sleep(0.08)

                # Send end event
                yield f"data: {json.dumps({'type': 'end'})}\n\n"

            except Exception as e:
                logger.error(f"Error in streaming response: {str(e)}")
                error_msg = "I apologize, but I'm having trouble responding right now."
                for word in error_msg.split():
                    yield f"data: {json.dumps({'type': 'chunk', 'content': word + ' '})}\n\n"
                    await asyncio.sleep(0.08)
                yield f"data: {json.dumps({'type': 'end'})}\n\n"

        return StreamingResponse(
            generate_streaming_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
            },
        )

    except Exception as e:
        logger.error(f"Error setting up streaming response: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to stream response: {str(e)}"
        )
