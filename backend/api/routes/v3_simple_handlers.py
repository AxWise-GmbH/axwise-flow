"""
API route handlers for Customer Research API v3 Simplified.

This module contains all FastAPI route handlers for the V3 Simple system.

Extracted from customer_research_v3_simple.py for better modularity.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional
from fastapi import BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from .v3_simple_types import (
    ChatRequest, ChatResponse, HealthResponse,
    GenerateQuestionsRequest, ResearchQuestions, SimplifiedConfig
)
from .v3_simple_service import SimplifiedResearchService

logger = logging.getLogger(__name__)


async def delayed_cleanup(service: SimplifiedResearchService, delay_seconds: int = 30):
    """Clean up service instance after a delay to allow frontend polling."""
    try:
        logger.debug(f"Scheduling cleanup for service {service.request_id} in {delay_seconds} seconds")
        await asyncio.sleep(delay_seconds)

        if hasattr(service, 'cleanup'):
            service.cleanup()
            logger.debug(f"Delayed cleanup completed for service {service.request_id}")
        else:
            logger.warning(f"Service {service.request_id} has no cleanup method")

    except Exception as e:
        logger.error(f"Error during delayed cleanup for service {getattr(service, 'request_id', 'unknown')}: {e}")


async def chat_v3_simple(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    V3 Simplified customer research chat endpoint.

    This endpoint provides all V3 enhanced features with V1/V2 stability:
    - Enhanced context extraction and analysis
    - Industry classification and stakeholder detection
    - Intelligent conversation flow management
    - Smart caching and performance optimization
    - Comprehensive thinking process tracking
    - Robust error handling with V1 fallback
    """

    try:
        logger.info(f"V3 Simple chat request from user {request.user_id if request.user_id else 'anonymous'}")

        # Validate request (optional - skip if validation module not available)
        try:
            from backend.utils.research_validation import validate_research_request, ValidationError as ResearchValidationError
            validate_research_request(request.model_dump())
        except ImportError:
            logger.debug("Research validation module not available - skipping validation")
        except Exception as e:
            logger.warning(f"Request validation warning: {e}")
            # Continue with warning for research chat

        # Create request-scoped service
        config = SimplifiedConfig(
            enable_thinking_process=request.enable_thinking_process
        )

        # Override enhanced analysis features based on request
        if not request.enable_enhanced_analysis:
            config.enable_industry_analysis = False
            config.enable_stakeholder_detection = False
            config.enable_enhanced_context = False
        service = SimplifiedResearchService(config)

        # Build conversation context with validation
        conversation_context = ""
        try:
            for msg in request.messages:
                if msg and msg.role and msg.content:
                    conversation_context += f"{msg.role}: {msg.content}\n"

            # Add current user input
            if request.input:
                conversation_context += f"user: {request.input}\n"

            # Ensure we have some content
            if not conversation_context.strip():
                conversation_context = f"user: {request.input or 'Hello'}\n"

        except Exception as e:
            logger.warning(f"Error building conversation context: {e}")
            conversation_context = f"user: {request.input or 'Hello'}\n"

        logger.info(f"Processing conversation context: {len(conversation_context)} characters")
        logger.debug(f"Conversation context preview: {conversation_context[:200]}...")

        # Perform comprehensive analysis
        analysis_result = await service.analyze_comprehensive(
            conversation_context=conversation_context,
            latest_input=request.input,
            messages=[msg.model_dump() for msg in request.messages],
            existing_context=request.context.model_dump() if request.context else None
        )

        # Build response with proper metadata including suggestions
        metadata = analysis_result.get("metadata", {})

        # Ensure suggestions are in metadata if they exist in the analysis result
        if "suggestions" in analysis_result and analysis_result["suggestions"]:
            metadata["suggestions"] = analysis_result["suggestions"]
            metadata["contextual_suggestions"] = analysis_result["suggestions"]

        # Ensure request_id is in metadata for progressive updates
        metadata["request_id"] = service.request_id

        # Return plain dictionary to avoid Pydantic validation issues
        response = {
            "content": analysis_result["content"],
            "metadata": metadata,
            "questions": analysis_result.get("questions"),
            "session_id": request.session_id,
            "thinking_process": analysis_result.get("thinking_process", []),
            "performance_metrics": analysis_result.get("performance_metrics"),
            "api_version": "v3-simple"
        }

        logger.info(f"V3 Simple chat completed successfully in {analysis_result.get('performance_metrics', {}).get('total_duration_ms', 0)}ms")

        # Schedule delayed cleanup to allow frontend polling
        # Don't clean up immediately - let frontend poll for thinking progress
        background_tasks.add_task(delayed_cleanup, service, 30)  # Clean up after 30 seconds

        return response

    except Exception as e:
        logger.error(f"V3 Simple chat endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat analysis failed: {str(e)}")


async def get_thinking_progress(request_id: str):
    """Get current thinking process steps for progressive updates."""
    try:
        logger.debug(f"Polling thinking progress for request_id: {request_id}")
        logger.debug(f"Active instances: {list(SimplifiedResearchService._active_instances.keys())}")

        if request_id in SimplifiedResearchService._active_instances:
            service = SimplifiedResearchService._active_instances[request_id]
            current_steps = service.get_current_thinking_steps()

            logger.debug(f"Found active instance {request_id} with {len(current_steps)} steps")

            return {
                "request_id": request_id,
                "thinking_steps": current_steps,
                "total_steps": len(current_steps),
                "completed_steps": len([s for s in current_steps if s.get("status") == "completed"]),
                "is_active": True
            }
        else:
            logger.debug(f"Request ID {request_id} not found in active instances")
            return {
                "request_id": request_id,
                "thinking_steps": [],
                "total_steps": 0,
                "completed_steps": 0,
                "is_active": False
            }
    except Exception as e:
        logger.error(f"Error getting thinking progress for {request_id}: {e}")
        return {
            "request_id": request_id,
            "thinking_steps": [],
            "total_steps": 0,
            "completed_steps": 0,
            "is_active": False,
            "error": str(e)
        }


async def health_check():
    """Health check endpoint for V3 Simplified API."""

    try:
        # Test service initialization
        service = SimplifiedResearchService()

        return HealthResponse(
            status="healthy",
            version="v3-simple",
            features=[
                "enhanced_context_analysis",
                "intelligent_intent_detection",
                "business_readiness_validation",
                "industry_classification",
                "stakeholder_detection",
                "conversation_flow_management",
                "smart_caching",
                "thinking_process_tracking",
                "v1_fallback_support",
                "performance_monitoring"
            ],
            performance={
                "request_timeout_seconds": 30,
                "cache_enabled": True,
                "fallback_enabled": True
            },
            timestamp=datetime.now().isoformat()
        )

    except Exception as e:
        logger.error(f"V3 Simple health check failed: {e}")
        return HealthResponse(
            status="degraded",
            version="v3-simple",
            features=[],
            performance={"error": str(e)},
            timestamp=datetime.now().isoformat()
        )


async def generate_questions_v3_simple(
    request: GenerateQuestionsRequest,
    db: Session = Depends(get_db)
):
    """
    Generate research questions based on context and conversation history.
    V3 Simple version with enhanced capabilities.
    """
    try:
        logger.info("Generating research questions (V3 Simple)")

        # Import V1/V2 proven function
        from backend.api.routes.customer_research import generate_research_questions
        from backend.services.llm import LLMServiceFactory

        # Create LLM service
        llm_service = LLMServiceFactory.create("gemini")

        # Generate questions using proven V1/V2 logic
        questions = await generate_research_questions(
            llm_service=llm_service,
            context=request.context,
            conversation_history=request.conversationHistory
        )

        return questions

    except Exception as e:
        logger.error(f"Error generating questions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


async def get_research_sessions_v3_simple(
    user_id: Optional[str] = None,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Get research sessions for dashboard (V3 Simple version)."""
    try:
        # Import V1/V2 session service
        from backend.services.research_session_service import ResearchSessionService

        session_service = ResearchSessionService(db)

        if user_id:
            sessions = session_service.get_user_sessions(user_id, limit)
        else:
            sessions = session_service.get_recent_sessions(limit)

        # Convert to summary format
        summaries = []
        for session in sessions:
            summary = session_service.get_session_summary(session.session_id)
            if summary:
                summaries.append(summary)

        return summaries

    except Exception as e:
        logger.error(f"Error getting sessions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get sessions: {str(e)}")
