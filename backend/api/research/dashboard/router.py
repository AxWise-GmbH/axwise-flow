"""
FastAPI router for Research Dashboard functionality.
Provides endpoints for dashboard-based question generation using conversation routines.
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.api.research.conversation_routines.service import (
    ConversationRoutineService,
)
from backend.api.research.conversation_routines.models import (
    ConversationRoutineRequest,
    ConversationRoutineResponse,
    ConversationContext,
)

logger = logging.getLogger(__name__)


# Models for dashboard-specific requests
class DashboardQuestionRequest(BaseModel):
    business_idea: str
    target_customer: str
    problem: str
    session_id: str = "dashboard-session"


class DashboardQuestionResponse(BaseModel):
    success: bool
    message: str
    questions: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}


class ContextValidationResponse(BaseModel):
    is_valid: bool
    completeness_score: float
    missing_fields: List[str]
    suggestions: List[str]


# Router
router = APIRouter(
    prefix="/api/research/dashboard",
    tags=["Research Dashboard"],
)

# Initialize conversation routine service
conversation_service = ConversationRoutineService()


@router.get("/health")
async def health_check():
    """Health check endpoint for research dashboard"""
    return {"status": "healthy", "service": "research-dashboard"}


@router.post("/validate-context", response_model=ContextValidationResponse)
async def validate_research_context(
    request: DashboardQuestionRequest,
) -> ContextValidationResponse:
    """
    Validate research context completeness and provide suggestions.
    """
    try:
        logger.info("🔍 Validating research context...")

        missing_fields = []
        suggestions = []

        # Check required fields
        if not request.business_idea or len(request.business_idea.strip()) < 10:
            missing_fields.append("business_idea")
            suggestions.append(
                "Provide a more detailed description of your business idea"
            )

        if not request.target_customer or len(request.target_customer.strip()) < 5:
            missing_fields.append("target_customer")
            suggestions.append("Specify who your target customers are")

        if not request.problem or len(request.problem.strip()) < 10:
            missing_fields.append("problem")
            suggestions.append("Describe the specific problem you're solving")

        # Calculate completeness score
        total_fields = 3
        complete_fields = total_fields - len(missing_fields)
        completeness_score = (complete_fields / total_fields) * 100

        is_valid = len(missing_fields) == 0

        return ContextValidationResponse(
            is_valid=is_valid,
            completeness_score=completeness_score,
            missing_fields=missing_fields,
            suggestions=suggestions,
        )

    except Exception as e:
        logger.error(f"🔴 Context validation failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Context validation failed: {str(e)}"
        )


@router.post("/generate-questions", response_model=DashboardQuestionResponse)
async def generate_dashboard_questions(
    request: DashboardQuestionRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> DashboardQuestionResponse:
    """
    Generate research questions using conversation routines service.
    This endpoint bypasses the chat interface and directly generates questions.
    """
    try:
        logger.info(
            f"🎯 Dashboard question generation for: {request.business_idea[:50]}..."
        )

        # Validate context first
        validation = await validate_research_context(request)
        if not validation.is_valid:
            return DashboardQuestionResponse(
                success=False,
                message=f"Context incomplete: {', '.join(validation.missing_fields)}",
                metadata={
                    "validation": validation.dict(),
                    "completeness_score": validation.completeness_score,
                },
            )

        # Create a conversation context that simulates completion
        context = ConversationContext(
            business_idea=request.business_idea,
            target_customer=request.target_customer,
            problem=request.problem,
            exchange_count=6,  # Simulate enough exchanges to trigger generation
            user_fatigue_signals=[],
        )

        # Create a synthetic conversation request that will trigger question generation
        conversation_request = ConversationRoutineRequest(
            input="Yes, that's correct. Please generate the research questions now.",
            messages=[
                {
                    "role": "user",
                    "content": f"I want to create a business around: {request.business_idea}",
                    "timestamp": "2024-01-01T00:00:00Z",
                },
                {
                    "role": "assistant",
                    "content": "Tell me more about your target customers.",
                    "timestamp": "2024-01-01T00:01:00Z",
                },
                {
                    "role": "user",
                    "content": f"My target customers are: {request.target_customer}",
                    "timestamp": "2024-01-01T00:02:00Z",
                },
                {
                    "role": "assistant",
                    "content": "What specific problem are you solving?",
                    "timestamp": "2024-01-01T00:03:00Z",
                },
                {
                    "role": "user",
                    "content": f"The problem I'm solving is: {request.problem}",
                    "timestamp": "2024-01-01T00:04:00Z",
                },
                {
                    "role": "assistant",
                    "content": "Perfect! I have enough context. Should I generate research questions for you?",
                    "timestamp": "2024-01-01T00:05:00Z",
                },
            ],
            session_id=request.session_id,
            context=context,
        )

        # Process through conversation routine service
        response = await conversation_service.process_conversation(conversation_request)

        if response.should_generate_questions and response.questions:
            logger.info("✅ Dashboard questions generated successfully")
            return DashboardQuestionResponse(
                success=True,
                message="Research questions generated successfully",
                questions=response.questions,
                metadata={
                    "context_completeness": response.context.get_completeness_score(),
                    "stakeholder_count": {
                        "primary": len(
                            response.questions.get("primaryStakeholders", [])
                        ),
                        "secondary": len(
                            response.questions.get("secondaryStakeholders", [])
                        ),
                    },
                    "total_questions": sum(
                        [
                            len(s.get("questions", {}).get("problemDiscovery", []))
                            + len(s.get("questions", {}).get("solutionValidation", []))
                            + len(s.get("questions", {}).get("followUp", []))
                            for s in response.questions.get("primaryStakeholders", [])
                            + response.questions.get("secondaryStakeholders", [])
                        ]
                    ),
                    "generation_method": "dashboard_direct",
                    "conversation_routine": True,
                },
            )
        else:
            logger.warning("⚠️ Questions not generated - insufficient context")
            return DashboardQuestionResponse(
                success=False,
                message="Unable to generate questions - context may be insufficient",
                metadata={
                    "context_completeness": response.context.get_completeness_score(),
                    "should_generate_questions": response.should_generate_questions,
                    "response_content": (
                        response.content[:100] if response.content else None
                    ),
                },
            )

    except Exception as e:
        logger.error(f"🔴 Dashboard question generation failed: {str(e)}")
        return DashboardQuestionResponse(
            success=False,
            message=f"Question generation failed: {str(e)}",
            metadata={"error": str(e)},
        )


@router.post("/test-generation")
async def test_dashboard_generation():
    """Test endpoint for dashboard question generation"""
    try:
        test_request = DashboardQuestionRequest(
            business_idea="A meal planning app for busy parents who struggle to plan healthy meals for their families",
            target_customer="Working parents with children aged 3-12 who have limited time for meal planning",
            problem="Parents spend too much time deciding what to cook and often resort to unhealthy convenience foods",
            session_id="test-dashboard-session",
        )

        # Test validation
        validation = await validate_research_context(test_request)

        # Test generation if valid
        if validation.is_valid:
            # Mock database dependency for testing
            from unittest.mock import MagicMock

            mock_db = MagicMock()
            mock_background_tasks = MagicMock()

            result = await generate_dashboard_questions(
                test_request, mock_background_tasks, mock_db
            )

            return {
                "test_status": "success",
                "validation": validation.dict(),
                "generation_result": {
                    "success": result.success,
                    "message": result.message,
                    "has_questions": bool(result.questions),
                    "metadata": result.metadata,
                },
            }
        else:
            return {"test_status": "validation_failed", "validation": validation.dict()}

    except Exception as e:
        logger.error(f"🔴 Dashboard test failed: {str(e)}")
        return {"test_status": "error", "error": str(e)}
