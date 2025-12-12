"""
FastAPI router for the Simulation Bridge system.
"""

import logging
import os
import time
import uuid
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Depends
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
from .services.conversational_analysis_agent import ConversationalAnalysisAgent
from .services.file_processor import (
    SimulationFileProcessor,
    FileProcessingRequest,
    FileProcessingResult,
)
from backend.utils.structured_logger import request_start, request_end, request_error
from pydantic_ai.models.google import GoogleModel
from backend.models import User
from backend.services.external.auth_middleware import get_current_user

# Import authentication dependencies
from backend.services.external.auth_middleware import get_current_user
from backend.models import User

logger = logging.getLogger(__name__)

# Router
router = APIRouter(
    prefix="/api/research/simulation-bridge",
    tags=["Simulation Bridge"],
)

# Global orchestrator instance with enhanced capabilities
# Increase concurrency to align with user preferences (10–15)
orchestrator = SimulationOrchestrator(use_parallel=True, max_concurrent=12)


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
    request: SimulationRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """
    Create and run a complete interview simulation.

    This endpoint:
    1. Generates AI personas based on business context
    2. Simulates interviews with those personas
    3. Formats the results for analysis pipeline
    4. Returns comprehensive simulation data
    """
    endpoint = "/api/research/simulation-bridge/simulate"
    start = request_start(endpoint, user_id=user.user_id)
    http_status = 200
    try:
        # Handle raw questionnaire content with PydanticAI parsing
        if request.raw_questionnaire_content:
            parsed_request = await orchestrator.parse_raw_questionnaire(
                request.raw_questionnaire_content, request.config
            )
            request.questions_data = parsed_request.questions_data
            request.business_context = parsed_request.business_context

        # Validate request
        if not request.questions_data or not request.questions_data.stakeholders:
            http_status = 400
            raise HTTPException(
                status_code=400, detail="No stakeholders provided in questions data"
            )

        if not request.business_context or not request.business_context.business_idea:
            http_status = 400
            raise HTTPException(
                status_code=400, detail="Business idea is required for simulation"
            )

        # Run simulation with database persistence
        response = await orchestrator.simulate_with_persistence(
            request, user_id=user.user_id
        )

        if not response.success:
            http_status = 500
            raise HTTPException(status_code=500, detail=response.message)

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            simulation_id=getattr(response, "simulation_id", None),
        )
        return response

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint, start, user_id=user.user_id, http_status=http_status, error=str(e)
        )
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")


@router.post("/simulate-async")
async def simulate_async(
    request: SimulationRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Start simulation asynchronously and return simulation_id immediately.

    - Validates and (if needed) parses raw questionnaire.
    - Schedules the simulation in background with persistence and parallel processing.
    - Returns 202 Accepted with simulation_id and helpful next-step URLs.
    """
    endpoint = "/api/research/simulation-bridge/simulate-async"
    start = request_start(endpoint, user_id=user.user_id)
    http_status = 202
    try:
        # Handle raw questionnaire content with PydanticAI parsing
        if request.raw_questionnaire_content:
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

        # Generate a simulation_id now so the client can start polling
        simulation_id = str(uuid.uuid4())

        # Schedule background task to run the full simulation
        background_tasks.add_task(
            orchestrator.simulate_with_persistence, request, user.user_id, simulation_id
        )

        # Record request end with 202
        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            simulation_id=simulation_id,
        )

        base = "/api/research/simulation-bridge"
        return JSONResponse(
            status_code=202,
            content={
                "success": True,
                "message": "Simulation accepted and started in background",
                "simulation_id": simulation_id,
                "next_steps": {
                    "progress_url": f"{base}/simulate/{simulation_id}/progress",
                    "result_url": f"{base}/completed/{simulation_id}",
                },
            },
        )

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        request_error(
            endpoint, start, user_id=user.user_id, http_status=500, error=str(e)
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to start async simulation: {str(e)}"
        )


@router.post("/simulate-enhanced")
async def simulate_interviews_enhanced(
    request: SimulationRequest,
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """
    Enhanced simulation endpoint with database persistence and parallel processing.

    This endpoint provides:
    1. Database persistence for simulation results
    2. Parallel interview processing for better performance
    3. Enhanced error handling and recovery
    4. Progress tracking with detailed metrics
    """
    endpoint = "/api/research/simulation-bridge/simulate-enhanced"
    start = request_start(endpoint, user_id=user.user_id)
    http_status = 200
    try:
        # Handle raw questionnaire content with PydanticAI parsing
        if request.raw_questionnaire_content:
            parsed_request = await orchestrator.parse_raw_questionnaire(
                request.raw_questionnaire_content, request.config
            )
            request.questions_data = parsed_request.questions_data
            request.business_context = parsed_request.business_context

        # Validate required data
        if not request.questions_data or not request.business_context:
            http_status = 400
            raise HTTPException(
                status_code=400,
                detail="Both questions_data and business_context are required",
            )

        # Use enhanced simulation with persistence and parallel processing
        result = await orchestrator.simulate_with_persistence(request, user.user_id)

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            simulation_id=getattr(result, "simulation_id", None),
        )
        return result

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint, start, user_id=user.user_id, http_status=http_status, error=str(e)
        )
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
            "questions_data": parsed_request.questions_data.model_dump(),
            "business_context": parsed_request.business_context.model_dump(),
            "config": parsed_request.config.model_dump(),
        }

    except Exception as e:
        logger.error(f"Questionnaire parsing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {str(e)}")


@router.get("/simulate/{simulation_id}/progress")
async def get_simulation_progress(
    simulation_id: str, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get the progress of a running simulation.
    """
    endpoint = "/api/research/simulation-bridge/simulate/{simulation_id}/progress"
    start = request_start(
        endpoint, user_id=user.user_id, session_id=None, simulation_id=simulation_id
    )
    http_status = 200
    try:
        # First verify the user owns this simulation (only in production/auth-enabled mode)
        try:
            from backend.services.external.auth_middleware import ENABLE_CLERK_VALIDATION
        except Exception:
            ENABLE_CLERK_VALIDATION = False

        if ENABLE_CLERK_VALIDATION:
            try:
                from backend.infrastructure.persistence.unit_of_work import UnitOfWork
                from backend.infrastructure.persistence.simulation_repository import (
                    SimulationRepository,
                )
                from backend.database import SessionLocal

                async with UnitOfWork(SessionLocal) as uow:
                    simulation_repo = SimulationRepository(uow.session)
                    db_simulation = await simulation_repo.get_by_simulation_id(simulation_id)

                    if not db_simulation:
                        http_status = 404
                        raise HTTPException(status_code=404, detail="Simulation not found")

                    # SECURITY: Verify user owns this simulation
                    if db_simulation.user_id != user.user_id:
                        http_status = 403
                        raise HTTPException(
                            status_code=403,
                            detail="Access denied: You can only access your own simulations",
                        )
            except Exception as db_ex:
                # If the DB is not available or table is missing in OSS mode, don't fail progress polling
                logger.warning(f"Progress DB verification skipped due to error: {db_ex}")
        else:
            logger.info(
                f"Development mode: Skipping DB ownership check for progress {simulation_id}"
            )

        progress = orchestrator.get_simulation_progress(simulation_id)

        if not progress:
            http_status = 404
            raise HTTPException(
                status_code=404, detail="Simulation not found or completed"
            )

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            simulation_id=simulation_id,
            progress=progress.progress_percentage,
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


@router.post("/clear-cache")
async def clear_memory_cache() -> Dict[str, Any]:
    """
    Clear the orchestrator's memory cache of completed simulations.
    Useful when database and memory are out of sync.
    """
    try:
        cache_info_before = orchestrator.get_memory_cache_info()
        orchestrator.clear_memory_cache()

        return {
            "success": True,
            "message": "Memory cache cleared successfully",
            "cache_info_before": cache_info_before,
            "cache_info_after": orchestrator.get_memory_cache_info(),
        }
    except Exception as e:
        logger.error(f"Failed to clear memory cache: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")


@router.get("/cache-info")
async def get_cache_info() -> Dict[str, Any]:
    """
    Get information about the current memory cache state.
    """
    try:
        return {"success": True, "cache_info": orchestrator.get_memory_cache_info()}
    except Exception as e:
        logger.error(f"Failed to get cache info: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get cache info: {str(e)}"
        )


# Compatibility route to avoid redirect quirks on some setups
@router.get("/completed/by-id/{simulation_id}")
async def get_completed_simulation_by_id(
    simulation_id: str, user: User = Depends(get_current_user)
) -> SimulationResponse:
    """
    Alternate path for fetching a completed simulation by ID.
    Delegates to the primary handler to ensure identical behavior.
    """
    return await get_completed_simulation(simulation_id, user)

# Query-param alternative to avoid any path segment redirect issues
@router.get("/completed-item")
async def get_completed_simulation_item(
    simulation_id: str, user: User = Depends(get_current_user)
) -> SimulationResponse:
    """
    Fetch a completed simulation by ID using a query parameter.
    Equivalent to GET /completed/{simulation_id}.
    """
    return await get_completed_simulation(simulation_id, user)


@router.get("/completed/{simulation_id}")
async def get_completed_simulation(
    simulation_id: str, user: User = Depends(get_current_user)
) -> SimulationResponse:
    """
    Get a completed simulation result by ID from memory or database.
    """
    try:
        # First try to get from memory (for recent simulations)
        result = orchestrator.get_completed_simulation(simulation_id)

        if result:
            logger.info(f"Retrieved completed simulation from memory: {simulation_id}")
            return result

        # If not in memory, try database (always attempt; ownership enforced only when auth validation is enabled)
        try:
            from backend.services.external.auth_middleware import ENABLE_CLERK_VALIDATION
        except Exception:
            ENABLE_CLERK_VALIDATION = False

        try:
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

                # Ownership check only when auth validation is enforced
                if ENABLE_CLERK_VALIDATION and db_simulation.user_id != user.user_id:
                    raise HTTPException(
                        status_code=403,
                        detail="Access denied: You can only access your own simulations",
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
        except Exception as db_ex:
            # DB table may be missing in OSS mode; treat as not found instead of 500
            logger.warning(
                f"Completed simulation DB lookup skipped due to error: {db_ex}"
            )
            raise HTTPException(
                status_code=404, detail="Completed simulation not found"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get completed simulation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get simulation: {str(e)}"
        )


@router.post("/analyze/{simulation_id}")
async def analyze_simulation_results(
    simulation_id: str,
    analysis_options: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Direct bridge from simulation results to analysis pipeline.

    This endpoint handles complex multi-stakeholder, multi-interview scenarios:
    1. Retrieves completed simulation data (5 stakeholders × X interviews each)
    2. Formats all interview data for the analysis pipeline
    3. Automatically uploads it to the analysis system
    4. Triggers comprehensive analysis with smart defaults
    5. Returns analysis_id for tracking results

    Perfect for scenarios like:
    - 5 stakeholders × 5 interviews each = 25 total interviews
    - Automatic stakeholder breakdown analysis
    - Cross-stakeholder pattern detection
    - Unified insights across all interview data
    """
    try:
        logger.info(f"Starting analysis bridge for simulation: {simulation_id}")

        # Step 1: Get simulation results
        simulation_response = await get_completed_simulation(simulation_id)

        # Step 2: Prepare analysis options with smart defaults
        if analysis_options is None:
            analysis_options = {}

        analysis_config = {
            "llm_provider": analysis_options.get("llm_provider", "gemini"),
            "llm_model": analysis_options.get("llm_model", "gemini-2.5-pro"),
            "industry": analysis_options.get("industry", "general"),
            "analysis_type": "comprehensive_simulation",
            "include_stakeholder_breakdown": True,
        }

        # Step 3: Extract and format all interview data
        interviews = simulation_response.interviews or []
        personas = simulation_response.people or []
        metadata = simulation_response.metadata or {}

        if not interviews:
            raise HTTPException(
                status_code=400,
                detail=f"No interview data found in simulation {simulation_id}",
            )

        # Step 4: Create comprehensive analysis text
        # This combines ALL interviews from ALL stakeholders into one analysis-ready format
        stakeholder_groups = {}
        for interview in interviews:
            stakeholder_type = interview.get("stakeholder_type", "Unknown")
            if stakeholder_type not in stakeholder_groups:
                stakeholder_groups[stakeholder_type] = []
            stakeholder_groups[stakeholder_type].append(interview)

        # Build comprehensive analysis content
        analysis_content_parts = []

        # Add business context
        business_context = simulation_response.data.get("metadata", {}).get(
            "business_context", {}
        )
        if business_context:
            analysis_content_parts.append("=== BUSINESS CONTEXT ===")
            analysis_content_parts.append(
                f"Business Idea: {business_context.get('business_idea', 'N/A')}"
            )
            analysis_content_parts.append(
                f"Target Customer: {business_context.get('target_customer', 'N/A')}"
            )
            analysis_content_parts.append(
                f"Problem: {business_context.get('problem', 'N/A')}"
            )
            analysis_content_parts.append("")

        # Add simulation metadata
        analysis_content_parts.append("=== SIMULATION OVERVIEW ===")
        analysis_content_parts.append(f"Simulation ID: {simulation_id}")
        analysis_content_parts.append(
            f"Total Stakeholder Types: {len(stakeholder_groups)}"
        )
        analysis_content_parts.append(f"Total Interviews: {len(interviews)}")
        analysis_content_parts.append(
            f"Stakeholder Types: {', '.join(stakeholder_groups.keys())}"
        )
        analysis_content_parts.append("")

        # Add all interviews organized by stakeholder
        for stakeholder_type, stakeholder_interviews in stakeholder_groups.items():
            analysis_content_parts.append(
                f"=== {stakeholder_type.upper()} INTERVIEWS ==="
            )
            analysis_content_parts.append(
                f"Number of interviews: {len(stakeholder_interviews)}"
            )
            analysis_content_parts.append("")

            for idx, interview in enumerate(stakeholder_interviews, 1):
                # Find corresponding persona
                persona = next(
                    (p for p in personas if p.get("id") == interview.get("persona_id")),
                    {},
                )

                analysis_content_parts.append(f"--- Interview {idx} ---")
                analysis_content_parts.append(
                    f"Persona: {persona.get('name', 'Unknown')}"
                )
                analysis_content_parts.append(f"Role: {persona.get('role', 'Unknown')}")
                analysis_content_parts.append("")

                # Add Q&A pairs
                responses = interview.get("responses", [])
                for q_idx, response in enumerate(responses, 1):
                    analysis_content_parts.append(
                        f"Q{q_idx}: {response.get('question', '')}"
                    )
                    analysis_content_parts.append(
                        f"A{q_idx}: {response.get('response', '')}"
                    )
                    analysis_content_parts.append("")

                analysis_content_parts.append("---")
                analysis_content_parts.append("")

        analysis_ready_text = "\n".join(analysis_content_parts)

        logger.info(
            f"Created analysis content with {len(analysis_ready_text)} characters for {len(interviews)} interviews across {len(stakeholder_groups)} stakeholder types"
        )

        return {
            "success": True,
            "message": "Analysis bridge prepared successfully",
            "simulation_id": simulation_id,
            "preview": {
                "stakeholder_types": list(stakeholder_groups.keys()),
                "total_interviews": len(interviews),
                "content_length": len(analysis_ready_text),
                "analysis_config": analysis_config,
            },
            "next_steps": {
                "description": "Ready to upload to analysis pipeline",
                "estimated_analysis_time": "3-7 minutes",
                "analysis_url_pattern": "/unified-dashboard?analysisId={result_id}&visualizationTab=themes",
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis bridge failed for simulation {simulation_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis bridge failed: {str(e)}")


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

        from pydantic_ai.providers.google import GoogleProvider
        provider = GoogleProvider(api_key=api_key)
        model = GoogleModel("gemini-2.5-flash", provider=provider)
        generator = PersonaGenerator(model)
        personas = await generator.generate_personas(
            stakeholder, business_ctx, sim_config
        )

        return {
            "success": True,
            "personas": [persona.model_dump() for persona in personas],
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

        from pydantic_ai.providers.google import GoogleProvider
        provider = GoogleProvider(api_key=api_key)
        model = GoogleModel("gemini-2.5-flash", provider=provider)
        simulator = InterviewSimulator(model)
        interview = await simulator.simulate_interview(
            persona, stakeholder, business_ctx, sim_config
        )

        return {
            "success": True,
            "interview": interview.model_dump(),
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
        "default_config": default_config.model_dump(),
        "available_options": {
            "depth": ["quick", "detailed", "comprehensive"],
            "response_style": ["realistic", "optimistic", "critical", "mixed"],
            "personas_per_stakeholder": {"min": 1, "max": 5, "default": 2},
            "temperature": {"min": 0.0, "max": 1.0, "default": 0.7},
        },
    }


# Initialize conversational analysis components
def get_gemini_model():
    """Get configured Gemini model for conversational analysis"""
    from pydantic_ai.providers.google import GoogleProvider
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("Neither GEMINI_API_KEY nor GOOGLE_API_KEY environment variable is set")
    provider = GoogleProvider(api_key=api_key)
    return GoogleModel("gemini-2.5-flash", provider=provider)


def get_file_processor():
    """Get configured file processor instance"""
    return SimulationFileProcessor(get_gemini_model())


@router.post("/analyze-conversational/{simulation_id}")
async def analyze_simulation_conversational(
    simulation_id: str,
    analysis_options: Optional[Dict[str, Any]] = None,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Analyze simulation results using conversational routine approach.
    This is the new conversational analysis endpoint that replaces complex orchestration
    with conversational workflows for improved performance and maintainability.
    """
    endpoint = "/api/research/simulation-bridge/analyze-conversational/{simulation_id}"
    start = request_start(
        endpoint, user_id=user.user_id, session_id=None, simulation_id=simulation_id
    )
    http_status = 200
    try:
        # Get simulation results first
        simulation_response = await get_completed_simulation(simulation_id)
        if not simulation_response:
            http_status = 404
            raise HTTPException(
                status_code=404,
                detail=f"Simulation {simulation_id} not found or not completed",
            )

        # Extract simulation text data
        simulation_text = ""
        if (
            hasattr(simulation_response, "interview_results")
            and simulation_response.interview_results
        ):
            for interview in simulation_response.interview_results:
                simulation_text += f"\n\n--- Interview with {interview.get('persona_name', 'Unknown')} ---\n"
                simulation_text += interview.get("dialogue", "")

        if not simulation_text.strip():
            http_status = 400
            raise HTTPException(
                status_code=400, detail="No interview data found in simulation results"
            )

        file_processor = get_file_processor()
        processing_result = await file_processor.process_simulation_text_direct(
            simulation_text=simulation_text,
            simulation_id=simulation_id,
            user_id=user.user_id,
            file_name=f"simulation_{simulation_id}_analysis.txt",
            save_to_database=True,
        )

        if not processing_result.success:
            http_status = 500
            raise HTTPException(
                status_code=500,
                detail=f"Conversational analysis failed: {processing_result.error_message}",
            )

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            simulation_id=simulation_id,
            analysis_id=processing_result.analysis_id,
            processing_time_seconds=processing_result.processing_time_seconds,
        )

        return {
            "success": True,
            "message": "Conversational analysis completed successfully",
            "analysis_id": processing_result.analysis_id,
            "simulation_id": simulation_id,
            "processing_time_seconds": processing_result.processing_time_seconds,
            "file_size_bytes": processing_result.file_size_bytes,
            "database_saved": processing_result.database_saved,
            "analysis_result": (
                processing_result.analysis_result.model_dump()
                if processing_result.analysis_result
                else None
            ),
            "performance_metrics": {
                "target_time_met": processing_result.processing_time_seconds <= 420,
                "processing_approach": "conversational_routine",
                "efficiency_score": (
                    min(420 / processing_result.processing_time_seconds, 1.0)
                    if processing_result.processing_time_seconds > 0
                    else 1.0
                ),
            },
        }

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
            simulation_id=simulation_id,
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            error=str(e),
            simulation_id=simulation_id,
        )
        raise HTTPException(
            status_code=500, detail=f"Conversational analysis failed: {str(e)}"
        )


@router.post("/analyze-file-conversational")
async def analyze_file_conversational(
    file_path: str,
    simulation_id: Optional[str] = None,
    analysis_options: Optional[Dict[str, Any]] = None,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Analyze a simulation text file using conversational routine approach.
    Processes large text files (up to 1MB) through streaming analysis.
    """
    try:
        logger.info(f"Starting conversational file analysis for {file_path}")

        endpoint = "/api/research/simulation-bridge/analyze-file-conversational"
        start = request_start(endpoint, user_id=user.user_id, file_path=file_path)
        http_status = 200

        # Create processing request
        request = FileProcessingRequest(
            file_path=file_path,
            simulation_id=simulation_id,
            user_id=user.user_id,
            analysis_options=analysis_options or {},
            save_to_database=True,
        )

        # Process file through conversational analysis
        file_processor = get_file_processor()
        processing_result = await file_processor.process_simulation_file(request)

        if not processing_result.success:
            http_status = 500
            raise HTTPException(
                status_code=500,
                detail=f"File analysis failed: {processing_result.error_message}",
            )

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            analysis_id=processing_result.analysis_id,
            processing_time_seconds=processing_result.processing_time_seconds,
        )

        return {
            "success": True,
            "message": "File analysis completed successfully",
            "analysis_id": processing_result.analysis_id,
            "simulation_id": (
                processing_result.analysis_result.id
                if processing_result.analysis_result
                else None
            ),
            "processing_time_seconds": processing_result.processing_time_seconds,
            "file_size_bytes": processing_result.file_size_bytes,
            "database_saved": processing_result.database_saved,
            "analysis_result": (
                processing_result.analysis_result.model_dump()
                if processing_result.analysis_result
                else None
            ),
            "performance_metrics": {
                "target_time_met": processing_result.processing_time_seconds
                <= 420,  # 7 minutes
                "processing_approach": "conversational_routine_file",
                "efficiency_score": (
                    min(420 / processing_result.processing_time_seconds, 1.0)
                    if processing_result.processing_time_seconds > 0
                    else 1.0
                ),
                "file_size_mb": processing_result.file_size_bytes / (1024 * 1024),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File analysis failed for {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"File analysis failed: {str(e)}")


@router.get("/analysis-history/{user_id}")
async def get_analysis_history(
    user_id: str,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get analysis history for a user with pagination.
    """
    endpoint = "/api/research/simulation-bridge/analysis-history/{user_id}"
    start = request_start(
        endpoint,
        user_id=user.user_id,
        session_id=None,
        query_limit=limit,
        query_offset=offset,
    )
    http_status = 200
    try:
        # Verify user can access this data
        if user.user_id != user_id:
            http_status = 403
            raise HTTPException(
                status_code=403,
                detail="Access denied: Can only view your own analysis history",
            )

        file_processor = get_file_processor()
        analyses = await file_processor.list_user_analyses(user_id, limit, offset)

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            count=len(analyses),
        )
        return {
            "success": True,
            "analyses": analyses,
            "pagination": {"limit": limit, "offset": offset, "count": len(analyses)},
        }

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint, start, user_id=user.user_id, http_status=http_status, error=str(e)
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to get analysis history: {str(e)}"
        )


@router.get("/analysis/{analysis_id}")
async def get_analysis_result(
    analysis_id: str, user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get specific analysis result by ID.
    """
    endpoint = "/api/research/simulation-bridge/analysis/{analysis_id}"
    start = request_start(
        endpoint, user_id=user.user_id, session_id=None, analysis_id=analysis_id
    )
    http_status = 200
    try:
        file_processor = get_file_processor()
        analysis_result = await file_processor.get_analysis_from_database(
            analysis_id, user.user_id
        )

        if not analysis_result:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Analysis {analysis_id} not found"
            )

        request_end(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            analysis_id=analysis_id,
        )
        return {"success": True, "analysis_result": analysis_result.model_dump()}

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
            analysis_id=analysis_id,
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=user.user_id,
            http_status=http_status,
            error=str(e),
            analysis_id=analysis_id,
        )
        raise HTTPException(status_code=500, detail=f"Failed to get analysis: {str(e)}")
