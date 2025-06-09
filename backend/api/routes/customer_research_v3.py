"""
Customer Research API v3 - Unified Research API with Enhanced Models and Services.

This is the production-ready V3 API that combines all enhanced components:
- Enhanced Pydantic models with comprehensive validation
- Advanced Instructor client with retry logic
- Complete V1 feature preservation with enhanced capabilities
- Master research service orchestration
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services.external.auth_middleware import get_current_user
from backend.models import User
from backend.services.research_session_service import ResearchSessionService
from backend.models.research_session import ResearchSessionCreate, ResearchSessionUpdate
from backend.utils.research_validation import validate_research_request, ValidationError as ResearchValidationError
from backend.utils.research_error_handler import (
    ErrorHandler, with_retry, with_timeout, APIError, APITimeoutError,
    ServiceUnavailableError, safe_execute
)

# Import our V3 components
from backend.services.research.master_research_service import MasterResearchService, ResearchServiceConfig
from backend.models.enhanced_research_models import EnhancedResearchResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/research/v3",
    tags=["customer_research_v3"],
    responses={404: {"description": "Not found"}},
)

# Request/Response models for API compatibility
class Message(BaseModel):
    id: str
    content: str
    role: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None


class ResearchContext(BaseModel):
    businessIdea: Optional[str] = None
    targetCustomer: Optional[str] = None
    problem: Optional[str] = None
    stage: Optional[str] = None
    questionsGenerated: Optional[bool] = None


class ChatRequest(BaseModel):
    messages: List[Message]
    input: str
    context: Optional[ResearchContext] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None

    # V3 specific options
    enable_enhanced_analysis: bool = Field(default=True, description="Enable enhanced V3 analysis")
    enable_parallel_processing: bool = Field(default=True, description="Enable parallel component processing")
    v1_compatibility_mode: bool = Field(default=False, description="Use V1 compatibility mode")


class ChatResponse(BaseModel):
    content: str
    metadata: Optional[Dict[str, Any]] = None
    questions: Optional[Dict[str, List[str]]] = None
    session_id: Optional[str] = None

    # V3 enhanced response fields
    enhanced_analysis: Optional[Dict[str, Any]] = None
    performance_metrics: Optional[Dict[str, Any]] = None
    thinking_process: Optional[List[Dict[str, Any]]] = None  # New field for thinking steps
    api_version: str = Field(default="v3", description="API version")


class AnalysisRequest(BaseModel):
    conversation_context: str
    latest_input: str
    messages: List[Message]
    existing_context: Optional[Dict[str, Any]] = None
    session_metadata: Optional[Dict[str, Any]] = None

    # Analysis options
    enable_industry_analysis: bool = Field(default=True)
    enable_stakeholder_detection: bool = Field(default=True)
    enable_enhanced_context: bool = Field(default=True)
    enable_conversation_flow: bool = Field(default=True)


class AnalysisResponse(BaseModel):
    analysis: EnhancedResearchResponse
    performance_metrics: Dict[str, Any]
    api_version: str = Field(default="v3")


# Master service will be initialized lazily
master_service = None

def get_master_service():
    """Get or create master service instance."""
    global master_service
    if master_service is None:
        master_service = MasterResearchService(
            config=ResearchServiceConfig(
                enable_parallel_processing=True,
                enable_caching=True,
                enable_v1_fallback=True,
                v1_compatibility_mode=False
            )
        )
    return master_service


@router.post("/chat", response_model=ChatResponse)
async def chat_v3(
    request: ChatRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Enhanced customer research chat endpoint with V3 capabilities.

    This endpoint provides:
    - Comprehensive research analysis using all V3 components
    - Enhanced conversation flow management
    - Industry-specific guidance and stakeholder detection
    - Advanced question generation with quality scoring
    - Performance monitoring and metrics
    - Full V1 compatibility when needed
    """

    try:
        logger.info(f"V3 Chat request from user {current_user.user_id if current_user else 'anonymous'}")

        # Validate request
        try:
            validate_research_request(request.model_dump())
        except ResearchValidationError as e:
            logger.warning(f"Request validation warning: {e}")
            # Continue with warning for research chat

        # Create services
        session_service = ResearchSessionService(db)

        # Configure master service based on request options
        service_config = ResearchServiceConfig(
            enable_parallel_processing=request.enable_parallel_processing,
            enable_industry_analysis=True,
            enable_stakeholder_detection=True,
            enable_enhanced_context=request.enable_enhanced_analysis,
            enable_conversation_flow=True,
            v1_compatibility_mode=request.v1_compatibility_mode
        )

        # Create master service instance for this request
        request_master_service = MasterResearchService(config=service_config)

        # Handle session management
        session_id = request.session_id
        is_local_session = session_id and session_id.startswith('local_')

        if not session_id:
            # Create new session
            session_data = ResearchSessionCreate(
                user_id=request.user_id,
                business_idea=request.context.businessIdea if request.context else None,
                target_customer=request.context.targetCustomer if request.context else None,
                problem=request.context.problem if request.context else None
            )

            if not is_local_session:
                session = session_service.create_session(session_data)
                session_id = session.session_id
                logger.info(f"Created new session: {session_id}")
            else:
                session_id = f"local_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                logger.info(f"Using local session: {session_id}")

        # Build conversation context
        conversation_context = ""
        for msg in request.messages:
            conversation_context += f"{msg.role}: {msg.content}\n"
        conversation_context += f"user: {request.input}\n"

        logger.info(f"Processing V3 analysis for {len(conversation_context)} characters of context")

        # Perform comprehensive V3 analysis
        if request.v1_compatibility_mode:
            # Use V1-compatible analysis
            analysis_result = await request_master_service.analyze_research_v1_compatible(
                conversation_context=conversation_context,
                latest_input=request.input,
                messages=[msg.model_dump() for msg in request.messages],
                existing_context=request.context.model_dump() if request.context else None
            )

            # Convert V1 result to V3 response format
            response = ChatResponse(
                content=analysis_result["content"],
                metadata=analysis_result.get("metadata"),
                questions=analysis_result.get("questions"),
                session_id=session_id,
                api_version="v3-v1-compat"
            )

        else:
            # Use full V3 enhanced analysis
            enhanced_response = await request_master_service.analyze_research_comprehensive(
                conversation_context=conversation_context,
                latest_input=request.input,
                messages=[msg.model_dump() for msg in request.messages],
                existing_context=request.context.model_dump() if request.context else None,
                session_metadata={"session_id": session_id, "user_id": request.user_id}
            )

            # Convert enhanced response to API format
            response = ChatResponse(
                content=enhanced_response.content,
                metadata=enhanced_response.response_metadata,
                session_id=session_id,
                enhanced_analysis={
                    "user_intent": enhanced_response.user_intent.model_dump(),
                    "business_readiness": enhanced_response.business_readiness.model_dump(),
                    "extracted_context": enhanced_response.extracted_context.model_dump(),
                    "conversation_flow": enhanced_response.conversation_flow.model_dump(),
                    "industry_analysis": enhanced_response.industry_analysis.model_dump() if enhanced_response.industry_analysis else None,
                    "stakeholder_analysis": enhanced_response.stakeholder_analysis.model_dump() if enhanced_response.stakeholder_analysis else None
                },
                thinking_process=enhanced_response.response_metadata.get("thinking_process", []),
                performance_metrics=request_master_service.get_performance_metrics(),
                api_version="v3"
            )

            # Add questions if generated
            if enhanced_response.research_questions:
                response.questions = {
                    "problemDiscovery": [q.question for q in enhanced_response.research_questions.questions if q.category == "problem_discovery"][:5],
                    "solutionValidation": [q.question for q in enhanced_response.research_questions.questions if q.category == "solution_validation"][:5],
                    "followUp": [q.question for q in enhanced_response.research_questions.questions if q.category == "follow_up"][:3]
                }

        # Save messages to session (background task)
        if not is_local_session:
            background_tasks.add_task(
                save_messages_to_session,
                session_service,
                session_id,
                request.input,
                response.content
            )

        logger.info(f"V3 Chat response generated successfully for session {session_id}")
        return response

    except Exception as e:
        logger.error(f"V3 Chat endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_v3(
    request: AnalysisRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Direct research analysis endpoint for advanced use cases.

    This endpoint provides direct access to the comprehensive research analysis
    without the conversational wrapper, useful for:
    - Batch processing
    - Integration with other systems
    - Advanced analysis workflows
    """

    try:
        logger.info(f"V3 Analysis request from user {current_user.user_id if current_user else 'anonymous'}")

        # Configure service based on request
        service_config = ResearchServiceConfig(
            enable_industry_analysis=request.enable_industry_analysis,
            enable_stakeholder_detection=request.enable_stakeholder_detection,
            enable_enhanced_context=request.enable_enhanced_context,
            enable_conversation_flow=request.enable_conversation_flow
        )

        # Create service instance
        analysis_service = MasterResearchService(config=service_config)

        # Perform analysis
        enhanced_response = await analysis_service.analyze_research_comprehensive(
            conversation_context=request.conversation_context,
            latest_input=request.latest_input,
            messages=[msg.model_dump() for msg in request.messages],
            existing_context=request.existing_context,
            session_metadata=request.session_metadata
        )

        # Get performance metrics
        performance_metrics = analysis_service.get_performance_metrics()

        return AnalysisResponse(
            analysis=enhanced_response,
            performance_metrics=performance_metrics
        )

    except Exception as e:
        logger.error(f"V3 Analysis endpoint error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint for V3 API."""

    try:
        # Test master service
        service = get_master_service()
        metrics = service.get_performance_metrics()

        return {
            "status": "healthy",
            "version": "v3",
            "features": [
                "enhanced_pydantic_models",
                "instructor_client_integration",
                "v1_feature_preservation",
                "master_service_orchestration",
                "parallel_processing",
                "performance_monitoring",
                "industry_classification",
                "stakeholder_detection",
                "conversation_flow_management",
                "v1_compatibility"
            ],
            "performance": {
                "total_requests": metrics.get("total_requests", 0),
                "avg_duration_ms": metrics.get("avg_total_duration_ms", 0),
                "error_rate": metrics.get("error_rate", 0),
                "fallback_usage_rate": metrics.get("fallback_usage_rate", 0)
            }
        }

    except Exception as e:
        logger.error(f"V3 Health check failed: {e}")
        return {
            "status": "degraded",
            "version": "v3",
            "error": str(e)
        }


@router.get("/metrics")
async def get_metrics(current_user: User = Depends(get_current_user)):
    """Get detailed performance metrics for V3 API."""

    try:
        service = get_master_service()
        return {
            "master_service_metrics": service.get_performance_metrics(),
            "instructor_client_metrics": service.instructor_client.get_performance_stats(),
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Metrics endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Metrics retrieval failed: {str(e)}")


# Background task functions
async def save_messages_to_session(
    session_service: ResearchSessionService,
    session_id: str,
    user_input: str,
    assistant_response: str
):
    """Save messages to session in background."""

    try:
        # Save user message
        user_message = {
            "id": f"user_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}",
            "content": user_input,
            "role": "user",
            "timestamp": datetime.now().isoformat()
        }
        session_service.add_message(session_id, user_message)

        # Save assistant message
        assistant_message = {
            "id": f"assistant_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}",
            "content": assistant_response,
            "role": "assistant",
            "timestamp": datetime.now().isoformat()
        }
        session_service.add_message(session_id, assistant_message)

        logger.info(f"Messages saved to session {session_id}")

    except Exception as e:
        logger.error(f"Failed to save messages to session {session_id}: {e}")
