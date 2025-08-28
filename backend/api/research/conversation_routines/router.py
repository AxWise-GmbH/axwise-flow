"""
Conversation Routines API Router
Implements the 2025 Conversation Routines framework endpoint
"""

import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from .service import ConversationRoutineService
from .models import ConversationRoutineRequest, ConversationRoutineResponse
from backend.database import get_db
from backend.services.research_session_service import ResearchSessionService
from backend.models.research_session import ResearchSessionCreate, ResearchSessionUpdate

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/research/conversation-routines", tags=["Conversation Routines"]
)

# Initialize service
conversation_service = ConversationRoutineService()


@router.post("/chat", response_model=ConversationRoutineResponse)
async def conversation_routine_chat(
    request: ConversationRoutineRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Conversation Routines Chat Endpoint

    Implements the 2025 Conversation Routines framework for customer research.
    Uses single LLM call with embedded workflow logic instead of complex orchestration.

    Features:
    - Embedded business logic in natural language prompts
    - Context-driven flow decisions (no state machines)
    - Proactive transition to question generation
    - Maximum 6 exchanges before generating questions
    - Automatic user fatigue detection
    - Efficient stakeholder-based question generation
    """
    try:
        logger.info(f"🎯 Conversation Routines chat request: {request.input[:50]}...")

        # Process through conversation routine service
        response = await conversation_service.process_conversation(request)

        # Debug logging for response
        logger.info(f"🎯 API Response suggestions: {response.suggestions}")
        logger.info(f"🎯 API Response content length: {len(response.content)}")
        logger.info(
            f"🎯 API Response should_generate_questions: {response.should_generate_questions}"
        )

        # Save conversation session synchronously for now (to debug background task issues)
        logger.info(f"🔄 Attempting to save conversation session: {request.session_id}")
        try:
            await save_conversation_session(request, response, db)
            logger.info("✅ Conversation session saved successfully")
        except Exception as e:
            logger.error(f"❌ Failed to save conversation session: {str(e)}")
            import traceback

            logger.error(f"❌ Full traceback: {traceback.format_exc()}")
            # Don't fail the main request if session saving fails

        logger.info("✅ Conversation Routines chat completed successfully")
        return response

    except Exception as e:
        logger.error(f"🔴 Conversation Routines chat failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Conversation service temporarily unavailable: {str(e)}",
        )


@router.get("/health")
async def health_check():
    """Health check endpoint for conversation routines service"""
    try:
        # Basic service health check
        return {
            "status": "healthy",
            "service": "conversation-routines",
            "framework": "2025-conversation-routines",
            "features": [
                "embedded-workflow-logic",
                "context-driven-decisions",
                "proactive-transitions",
                "efficiency-optimization",
            ],
        }
    except Exception as e:
        logger.error(f"🔴 Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unhealthy")


@router.post("/test")
async def test_conversation_routine():
    """Test endpoint for conversation routines functionality"""
    try:
        # Create test request
        test_request = ConversationRoutineRequest(
            input="I want to create a meal planning app for busy parents",
            messages=[],
            session_id="test-session",
        )

        # Process test conversation
        response = await conversation_service.process_conversation(test_request)

        return {
            "test_status": "success",
            "response_preview": (
                response.content[:100] + "..."
                if len(response.content) > 100
                else response.content
            ),
            "context_completeness": response.context.get_completeness_score(),
            "should_generate_questions": response.should_generate_questions,
            "suggestions_count": len(response.suggestions),
        }

    except Exception as e:
        logger.error(f"🔴 Test failed: {e}")
        raise HTTPException(status_code=500, detail=f"Test failed: {str(e)}")


async def save_conversation_session(
    request: ConversationRoutineRequest,
    response: ConversationRoutineResponse,
    db: Session,
):
    """
    Save conversation session to database in background task.
    Creates or updates research session with conversation messages.
    """
    try:
        from datetime import datetime

        logger.info(f"💾 Saving conversation session: {request.session_id}")

        service = ResearchSessionService(db)

        # Prepare all messages including the new exchange
        all_messages = []

        # Add existing messages from request
        for i, msg in enumerate(request.messages):
            all_messages.append(
                {
                    "id": getattr(msg, "id", None)
                    or f"msg_{i}_{int(datetime.now().timestamp() * 1000)}",
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": (
                        msg.timestamp.isoformat()
                        if hasattr(msg.timestamp, "isoformat")
                        else str(msg.timestamp)
                    ),
                    "metadata": getattr(msg, "metadata", {}),
                }
            )

        # Add new user message
        user_message = {
            "id": f"user_{int(datetime.now().timestamp() * 1000)}",
            "role": "user",
            "content": request.input,
            "timestamp": datetime.now().isoformat(),
            "metadata": {},
        }
        all_messages.append(user_message)

        # Add new assistant response
        assistant_message = {
            "id": f"assistant_{int(datetime.now().timestamp() * 1000)}",
            "role": "assistant",
            "content": response.content,
            "timestamp": datetime.now().isoformat(),
            "metadata": {
                "conversation_routine": True,
                "context_completeness": response.context.get_completeness_score(),
                "exchange_count": response.context.exchange_count,
                "should_generate_questions": response.should_generate_questions,
                "questions_generated": bool(response.questions),
                "suggestions": response.suggestions,
                **(response.metadata or {}),
            },
        }
        all_messages.append(assistant_message)

        # Try to get existing session with fallback mechanism
        existing_session = service.get_session(request.session_id)

        # If session not found in database but has local_ prefix, it might be a localStorage session
        # that hasn't been synced yet. In this case, we should update the original session ID
        # instead of creating a new one.
        if not existing_session and request.session_id.startswith("local_"):
            logger.info(
                f"🔍 Session {request.session_id} not found in database - likely localStorage session"
            )
            # We'll create/update using the original session_id to maintain continuity

        if existing_session:
            # Update existing session
            update_data = ResearchSessionUpdate(
                messages=all_messages,
                conversation_context=f"Business: {response.context.business_idea}, Customer: {response.context.target_customer}, Problem: {response.context.problem}",
                stage=(
                    "conversation"
                    if not response.should_generate_questions
                    else "completed"
                ),
                status=(
                    "active" if not response.should_generate_questions else "completed"
                ),
            )

            # If questions were generated, save them
            if response.questions:
                update_data.research_questions = response.questions
                update_data.questions_generated = True
                update_data.completed_at = datetime.now()

            updated_session = service.update_session(request.session_id, update_data)
            logger.info(f"✅ Updated existing session: {request.session_id}")

        else:
            # Create new session preserving the original session_id from request
            # This ensures localStorage sessions maintain their ID when synced to database
            session_data = ResearchSessionCreate(
                user_id=request.user_id,
                business_idea=response.context.business_idea,
                target_customer=response.context.target_customer,
                problem=response.context.problem,
            )

            # CRITICAL: Use the exact session_id from request to maintain continuity
            # This prevents creating duplicate sessions for localStorage sessions
            logger.info(f"📝 Creating session with preserved ID: {request.session_id}")
            new_session = service.create_session(session_data, request.session_id)

            # Update with conversation data
            update_data = ResearchSessionUpdate(
                messages=all_messages,
                conversation_context=f"Business: {response.context.business_idea}, Customer: {response.context.target_customer}, Problem: {response.context.problem}",
                stage=(
                    "conversation"
                    if not response.should_generate_questions
                    else "completed"
                ),
                status=(
                    "active" if not response.should_generate_questions else "completed"
                ),
                questions_generated=bool(response.questions),
                research_questions=response.questions if response.questions else None,
            )

            if response.questions:
                update_data.completed_at = datetime.now()

            # Update the session with the conversation data
            updated_session = service.update_session(
                new_session.session_id, update_data
            )

            logger.info(f"✅ Created new session: {new_session.session_id}")

    except Exception as e:
        logger.error(
            f"❌ Failed to save conversation session {request.session_id}: {str(e)}"
        )
        # Don't raise exception to avoid breaking the main conversation flow
