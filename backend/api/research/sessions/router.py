"""
FastAPI router for Research Sessions management.
Provides CRUD endpoints for research sessions and questionnaire storage.
"""

import logging
import time
import json
from backend.utils.structured_logger import request_start, request_end, request_error
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import User
from backend.services.external.auth_middleware import get_current_user
from backend.services.research_session_service import ResearchSessionService
from backend.models.research_session import (
    ResearchSession,
    ResearchSessionCreate,
    ResearchSessionUpdate,
    ResearchSessionResponse,
    ResearchSessionSummary,
)

logger = logging.getLogger(__name__)

# Router
router = APIRouter(
    prefix="/api/research",
    tags=["Research Sessions"],
)


@router.get("/sessions", response_model=List[ResearchSessionSummary])
async def get_research_sessions(
    limit: int = Query(50, description="Maximum number of sessions to return"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[ResearchSessionSummary]:
    """
    Get research sessions for the authenticated user.

    Returns a list of research sessions filtered by the authenticated user's ID.
    SECURITY: Only returns sessions belonging to the authenticated user.
    """
    endpoint = "/api/research/sessions"
    start = request_start(
        endpoint, user_id=getattr(user, "user_id", None), session_id=None, limit=limit
    )
    http_status = 200
    try:
        service = ResearchSessionService(db)

        # SECURITY: Always filter by authenticated user - never return all sessions
        sessions = service.get_user_sessions(user.user_id, limit)

        # Convert to summary format
        session_summaries = []
        for session in sessions:
            message_count = len(session.messages) if session.messages else 0

            # Extract question and stakeholder counts from research_questions
            question_count = 0
            stakeholder_count = 0
            if session.research_questions:
                try:
                    questions_data = session.research_questions
                    if isinstance(questions_data, dict):
                        for stakeholder_type in [
                            "primaryStakeholders",
                            "secondaryStakeholders",
                        ]:
                            if stakeholder_type in questions_data:
                                stakeholders = questions_data[stakeholder_type]
                                if isinstance(stakeholders, list):
                                    stakeholder_count += len(stakeholders)
                                    for stakeholder in stakeholders:
                                        if (
                                            isinstance(stakeholder, dict)
                                            and "questions" in stakeholder
                                        ):
                                            stakeholder_questions = stakeholder[
                                                "questions"
                                            ]
                                            if isinstance(stakeholder_questions, dict):
                                                for category in [
                                                    "problemDiscovery",
                                                    "solutionValidation",
                                                    "followUp",
                                                ]:
                                                    if (
                                                        category
                                                        in stakeholder_questions
                                                    ):
                                                        category_questions = (
                                                            stakeholder_questions[
                                                                category
                                                            ]
                                                        )
                                                        if isinstance(
                                                            category_questions, list
                                                        ):
                                                            question_count += len(
                                                                category_questions
                                                            )
                except Exception as e:
                    logger.warning(
                        f"Error parsing research_questions for session {session.session_id}: {e}"
                    )

            last_message_at = None
            if session.messages and len(session.messages) > 0:
                try:
                    last_message = session.messages[-1]
                    if isinstance(last_message, dict) and "timestamp" in last_message:
                        last_message_at = last_message["timestamp"]
                    else:
                        last_message_at = session.updated_at
                except Exception:
                    last_message_at = session.updated_at

            questionnaire_exported = False
            try:
                service = ResearchSessionService(db)
                exports = service.get_session_exports(session.session_id)
                questionnaire_exported = len(exports) > 0
            except Exception:
                questionnaire_exported = False

            title = (
                session.business_idea[:50] + "..."
                if session.business_idea and len(session.business_idea) > 50
                else (session.business_idea or "Untitled Research Session")
            )

            summary = ResearchSessionSummary(
                id=session.session_id,
                session_id=session.session_id,
                title=title,
                business_idea=session.business_idea,
                target_customer=session.target_customer,
                problem=session.problem,
                industry=session.industry,
                stage=session.stage,
                status=session.status,
                questions_generated=session.questions_generated,
                has_questionnaire=session.questions_generated,
                questionnaire_exported=questionnaire_exported,
                created_at=session.created_at,
                updated_at=session.updated_at,
                completed_at=session.completed_at,
                message_count=message_count,
                question_count=question_count,
                stakeholder_count=stakeholder_count,
                last_message_at=last_message_at,
                messages=session.messages or [],
                research_questions=session.research_questions,
            )
            session_summaries.append(summary)

        request_end(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=None,
            http_status=http_status,
            count=len(session_summaries),
        )
        return session_summaries

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=None,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=None,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve research sessions: {str(e)}"
        )


@router.get("/sessions/{session_id}", response_model=ResearchSessionResponse)
async def get_research_session(
    session_id: str,
    db: Session = Depends(get_db),
) -> ResearchSessionResponse:
    """Get a specific research session by ID."""
    endpoint = "/api/research/sessions/{session_id}"
    start = request_start(endpoint, user_id=None, session_id=session_id)
    http_status = 200
    try:
        service = ResearchSessionService(db)
        session = service.get_session(session_id)

        if not session:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        response = ResearchSessionResponse(
            id=session.id,
            session_id=session.session_id,
            user_id=session.user_id,
            business_idea=session.business_idea,
            target_customer=session.target_customer,
            problem=session.problem,
            industry=session.industry,
            stage=session.stage,
            status=session.status,
            messages=session.messages or [],
            conversation_context=session.conversation_context,
            research_questions=session.research_questions,
            questions_generated=session.questions_generated,
            created_at=session.created_at,
            updated_at=session.updated_at,
            completed_at=session.completed_at,
        )

        request_end(
            endpoint,
            start,
            user_id=session.user_id,
            session_id=session_id,
            http_status=http_status,
        )
        return response

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve research session: {str(e)}"
        )


@router.post("/sessions", response_model=ResearchSessionResponse)
async def create_research_session(
    session_data: ResearchSessionCreate,
    db: Session = Depends(get_db),
) -> ResearchSessionResponse:
    """Create a new research session with collision handling."""
    endpoint = "/api/research/sessions (create)"
    start = request_start(endpoint, user_id=None, session_id=session_data.session_id)
    http_status = 200
    try:
        service = ResearchSessionService(db)
        session = service.create_session(session_data, session_data.session_id)

        # Convert to response format
        response = ResearchSessionResponse(
            id=session.id,
            session_id=session.session_id,
            user_id=session.user_id,
            business_idea=session.business_idea,
            target_customer=session.target_customer,
            problem=session.problem,
            industry=session.industry,
            stage=session.stage,
            status=session.status,
            messages=session.messages or [],
            conversation_context=session.conversation_context,
            research_questions=session.research_questions,
            questions_generated=session.questions_generated,
            created_at=session.created_at,
            updated_at=session.updated_at,
            completed_at=session.completed_at,
        )

        request_end(
            endpoint,
            start,
            user_id=session.user_id,
            session_id=session.session_id,
            http_status=http_status,
        )
        return response

    except Exception as e:
        http_status = 500
        # Provide more specific error messages for common issues
        error_message = str(e)
        if "duplicate key value violates unique constraint" in error_message:
            error_message = "Session ID collision occurred. Please try again."
        elif "Failed to create session after" in error_message:
            error_message = "Unable to generate unique session ID. Please try again."

        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_data.session_id,
            http_status=http_status,
            error=error_message,
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create research session: {error_message}",
        )


@router.put("/sessions/{session_id}", response_model=ResearchSessionResponse)
async def update_research_session(
    session_id: str,
    update_data: ResearchSessionUpdate,
    db: Session = Depends(get_db),
) -> ResearchSessionResponse:
    """Update a research session."""
    endpoint = "/api/research/sessions/{session_id} (update)"
    start = request_start(endpoint, user_id=None, session_id=session_id)
    http_status = 200
    try:
        service = ResearchSessionService(db)
        session = service.update_session(session_id, update_data)

        if not session:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        response = ResearchSessionResponse(
            id=session.id,
            session_id=session.session_id,
            user_id=session.user_id,
            business_idea=session.business_idea,
            target_customer=session.target_customer,
            problem=session.problem,
            industry=session.industry,
            stage=session.stage,
            status=session.status,
            messages=session.messages or [],
            conversation_context=session.conversation_context,
            research_questions=session.research_questions,
            questions_generated=session.questions_generated,
            created_at=session.created_at,
            updated_at=session.updated_at,
            completed_at=session.completed_at,
        )

        request_end(
            endpoint,
            start,
            user_id=session.user_id,
            session_id=session_id,
            http_status=http_status,
        )
        return response

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to update research session: {str(e)}"
        )


@router.delete("/sessions/{session_id}")
async def delete_research_session(
    session_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a research session."""
    endpoint = "/api/research/sessions/{session_id} (delete)"
    start = request_start(endpoint, user_id=None, session_id=session_id)
    http_status = 200
    try:
        service = ResearchSessionService(db)
        success = service.delete_session(session_id)

        if not success:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        request_end(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
        )
        return {
            "success": True,
            "message": f"Research session {session_id} deleted successfully",
        }

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to delete research session: {str(e)}"
        )


@router.post("/sessions/{session_id}/questionnaire")
async def save_questionnaire(
    session_id: str,
    questionnaire_data: Dict[str, Any],
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Save generated questionnaire to a research session."""
    endpoint = "/api/research/sessions/{session_id}/questionnaire (save)"
    start = request_start(endpoint, user_id=None, session_id=session_id)
    http_status = 200
    try:
        service = ResearchSessionService(db)

        # Check if session already has questionnaire to avoid unnecessary updates
        existing_session = service.get_session(session_id)
        if existing_session and existing_session.questions_generated:
            request_end(
                endpoint,
                start,
                user_id=existing_session.user_id,
                session_id=session_id,
                http_status=http_status,
                skipped=True,
            )
            return {
                "success": True,
                "message": "Questionnaire already exists for this session",
                "session_id": session_id,
                "questions_generated": True,
            }

        # Auto-create session for local_* IDs to support dev/local flows
        if existing_session is None and session_id.startswith("local_"):
            try:
                from backend.models.research_session import ResearchSessionCreate

                service.create_session(
                    ResearchSessionCreate(
                        session_id=session_id,
                        user_id="anonymous",
                        business_idea=questionnaire_data.get("business_idea"),
                        target_customer=questionnaire_data.get("target_customer"),
                        problem=questionnaire_data.get("problem"),
                        industry="general",
                        stage="initial",
                        status="active",
                        messages=[],
                        questions_generated=False,
                    ),
                    session_id=session_id,
                )
            except Exception as e:
                logger.warning(f"Auto-create local session failed: {e}")

        session = service.complete_session(session_id, questionnaire_data)

        if not session:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        request_end(
            endpoint,
            start,
            user_id=session.user_id,
            session_id=session_id,
            http_status=http_status,
        )
        return {
            "success": True,
            "message": "Questionnaire saved successfully",
            "session_id": session_id,
            "questions_generated": session.questions_generated,
        }

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to save questionnaire: {str(e)}"
        )


@router.get("/sessions/{session_id}/questionnaire")
async def get_questionnaire(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get the questionnaire for a research session."""
    endpoint = "/api/research/sessions/{session_id}/questionnaire"
    start = request_start(
        endpoint, user_id=getattr(user, "user_id", None), session_id=session_id
    )
    http_status = 200
    try:
        service = ResearchSessionService(db)
        session = service.get_session(session_id)

        if not session:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        # SECURITY: Verify user owns this session (skip for local_* sessions in dev/local flows)
        if (
            not session.session_id.startswith("local_")
            and session.user_id != user.user_id
        ):
            http_status = 403
            raise HTTPException(
                status_code=403,
                detail="Access denied: You can only access your own sessions",
            )

        if not session.questions_generated or not session.research_questions:
            http_status = 404
            raise HTTPException(
                status_code=404,
                detail=f"No questionnaire found for session {session_id}",
            )

        response = {
            "success": True,
            "session_id": session_id,
            "questionnaire": session.research_questions,
            # Backward/forward compatibility for frontend expectations
            "questionnaire_data": session.research_questions,
            "business_context": {
                "business_idea": session.business_idea or "",
                "target_customer": session.target_customer or "",
                "problem": session.problem or "",
                "industry": session.industry or "general",
            },
            "generated_at": (
                session.completed_at.isoformat() if session.completed_at else None
            ),
        }

        request_end(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=session_id,
            http_status=http_status,
        )
        return response

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=getattr(user, "user_id", None),
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve questionnaire: {str(e)}"
        )


@router.post("/sessions/{session_id}/export")
async def export_questionnaire(
    session_id: str,
    export_request: Dict[str, Any],
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Export questionnaire in specified format."""
    endpoint = "/api/research/sessions/{session_id}/export"
    start = request_start(
        endpoint,
        user_id=None,
        session_id=session_id,
        export_type=export_request.get("type"),
        export_format=export_request.get("format"),
    )
    http_status = 200
    try:
        export_type = export_request.get("type", "txt")
        export_format = export_request.get("format", "detailed")

        service = ResearchSessionService(db)
        session = service.get_session(session_id)

        if not session:
            http_status = 404
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        if not session.questions_generated or not session.research_questions:
            http_status = 404
            raise HTTPException(
                status_code=404,
                detail=f"No questionnaire found for session {session_id}",
            )

        export_record = service.create_export(
            session_id=session_id, export_type=export_type, export_format=export_format
        )

        request_end(
            endpoint,
            start,
            user_id=session.user_id,
            session_id=session_id,
            http_status=http_status,
            export_id=export_record.id,
        )
        return {
            "success": True,
            "export_id": export_record.id,
            "session_id": session_id,
            "export_type": export_type,
            "export_format": export_format,
            "questionnaire": session.research_questions,
        }

    except HTTPException as he:
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=getattr(he, "status_code", 500),
            error=str(getattr(he, "detail", he)),
        )
        raise
    except Exception as e:
        http_status = 500
        request_error(
            endpoint,
            start,
            user_id=None,
            session_id=session_id,
            http_status=http_status,
            error=str(e),
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to export questionnaire: {str(e)}"
        )


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get all messages for a research session."""
    try:
        logger.info(f"📋 Getting messages for session: {session_id}")

        service = ResearchSessionService(db)
        session = service.get_session(session_id)

        if not session:
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        # SECURITY: Verify user owns this session
        if session.user_id != user.user_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied: You can only access your own sessions",
            )

        messages = session.messages or []

        logger.info(f"✅ Retrieved {len(messages)} messages for session: {session_id}")
        return {
            "success": True,
            "session_id": session_id,
            "messages": messages,
            "message_count": len(messages),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting messages for session {session_id}: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve messages: {str(e)}"
        )


@router.post("/sessions/{session_id}/messages")
async def add_session_message(
    session_id: str,
    message_data: Dict[str, Any],
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Add a message to a research session."""
    try:
        logger.info(f"💬 Adding message to session: {session_id}")

        service = ResearchSessionService(db)

        # SECURITY: First verify user owns this session
        session = service.get_session(session_id)
        if not session:
            raise HTTPException(
                status_code=404, detail=f"Research session {session_id} not found"
            )

        if session.user_id != user.user_id:
            raise HTTPException(
                status_code=403,
                detail="Access denied: You can only modify your own sessions",
            )

        session = service.add_message(session_id, message_data)

        logger.info(f"✅ Added message to session: {session_id}")
        return {
            "success": True,
            "session_id": session_id,
            "message_count": len(session.messages) if session.messages else 0,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error adding message to session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to add message: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint for research sessions API."""
    return {"status": "healthy", "service": "research-sessions"}
