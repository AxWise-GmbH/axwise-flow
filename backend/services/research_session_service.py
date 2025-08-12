"""
Research Session Service for managing customer research sessions
"""

import uuid
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.models.research_session import (
    ResearchSession,
    ResearchExport,
    ResearchSessionCreate,
    ResearchSessionUpdate,
    ResearchSessionResponse,
    ResearchSessionSummary,
)
from backend.database import get_db

logger = logging.getLogger(__name__)


class ResearchSessionService:
    """Service for managing research sessions."""

    def __init__(self, db: Session):
        self.db = db

    def create_session(
        self, session_data: ResearchSessionCreate, session_id: str = None
    ) -> ResearchSession:
        """Create a new research session with collision handling."""
        import uuid
        from sqlalchemy.exc import IntegrityError

        # Generate session_id if not provided
        target_session_id = session_id or str(uuid.uuid4())

        # First, check if session already exists
        existing_session = self.get_session(target_session_id)
        if existing_session:
            # If session exists and belongs to the same user, return it
            if existing_session.user_id == session_data.user_id:
                logger.info(
                    f"🔄 Returning existing session for user {session_data.user_id}: {target_session_id}"
                )
                return existing_session
            else:
                # Session exists but belongs to different user - generate new ID
                target_session_id = str(uuid.uuid4())
                logger.info(
                    f"🔀 Session ID collision detected, generating new ID: {target_session_id}"
                )

        # Attempt to create new session with retry logic for collisions
        max_retries = 3
        for attempt in range(max_retries):
            try:
                session = ResearchSession(
                    session_id=target_session_id,
                    user_id=session_data.user_id,
                    business_idea=session_data.business_idea,
                    target_customer=session_data.target_customer,
                    problem=session_data.problem,
                    messages=session_data.messages or [],
                    conversation_context=session_data.conversation_context or "",
                    industry=session_data.industry or "general",
                    stage=session_data.stage or "initial",
                    status=session_data.status or "active",
                    questions_generated=session_data.questions_generated or False,
                )

                self.db.add(session)
                self.db.commit()
                self.db.refresh(session)

                logger.info(f"✅ Created new research session: {target_session_id}")
                return session

            except IntegrityError as e:
                self.db.rollback()
                if "duplicate key value violates unique constraint" in str(e):
                    # Generate new UUID and retry
                    target_session_id = str(uuid.uuid4())
                    logger.warning(
                        f"🔄 Session ID collision on attempt {attempt + 1}, retrying with new ID: {target_session_id}"
                    )
                    if attempt == max_retries - 1:
                        raise Exception(
                            f"Failed to create session after {max_retries} attempts due to ID collisions"
                        )
                else:
                    # Different integrity error, re-raise
                    raise e

    def get_session(self, session_id: str) -> Optional[ResearchSession]:
        """Get a research session by ID."""
        return (
            self.db.query(ResearchSession)
            .filter(ResearchSession.session_id == session_id)
            .first()
        )

    def update_session(
        self, session_id: str, update_data: ResearchSessionUpdate
    ) -> Optional[ResearchSession]:
        """Update a research session."""

        session = self.get_session(session_id)
        if not session:
            return None

        # Update fields that are provided
        for field, value in update_data.dict(exclude_unset=True).items():
            setattr(session, field, value)

        session.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(session)

        return session

    def add_message(
        self, session_id: str, message: Dict[str, Any]
    ) -> Optional[ResearchSession]:
        """Add a message to the session."""

        session = self.get_session(session_id)
        if not session:
            return None

        # Initialize messages if None
        if session.messages is None:
            session.messages = []

        # Add the new message
        session.messages.append(message)
        session.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(session)

        return session

    def complete_session(
        self, session_id: str, research_questions: Dict[str, Any]
    ) -> Optional[ResearchSession]:
        """Mark a session as completed with generated questions."""

        session = self.get_session(session_id)
        if not session:
            return None

        session.status = "completed"
        session.questions_generated = True
        session.research_questions = research_questions
        session.completed_at = datetime.utcnow()
        session.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(session)

        return session

    def get_user_sessions(self, user_id: str, limit: int = 50) -> List[ResearchSession]:
        """Get all sessions for a user."""
        return (
            self.db.query(ResearchSession)
            .filter(ResearchSession.user_id == user_id)
            .order_by(desc(ResearchSession.updated_at))
            .limit(limit)
            .all()
        )

    def get_all_sessions(self, limit: int = 50) -> List[ResearchSession]:
        """Get all sessions (for development/testing purposes)."""
        return (
            self.db.query(ResearchSession)
            .order_by(desc(ResearchSession.updated_at))
            .limit(limit)
            .all()
        )

    def get_recent_sessions(self, limit: int = 20) -> List[ResearchSession]:
        """Get recent sessions (for admin/analytics)."""
        return (
            self.db.query(ResearchSession)
            .order_by(desc(ResearchSession.updated_at))
            .limit(limit)
            .all()
        )

    def get_session_summary(self, session_id: str) -> Optional[ResearchSessionSummary]:
        """Get a summary of a research session."""

        session = self.get_session(session_id)
        if not session:
            return None

        message_count = len(session.messages) if session.messages else 0

        return ResearchSessionSummary(
            id=session.id,
            session_id=session.session_id,
            business_idea=session.business_idea,
            industry=session.industry,
            stage=session.stage,
            status=session.status,
            questions_generated=session.questions_generated,
            created_at=session.created_at,
            message_count=message_count,
        )

    def create_export(
        self,
        session_id: str,
        export_type: str,
        export_format: str,
        file_path: Optional[str] = None,
    ) -> ResearchExport:
        """Create an export record."""

        export = ResearchExport(
            session_id=session_id,
            export_type=export_type,
            export_format=export_format,
            file_path=file_path,
        )

        self.db.add(export)
        self.db.commit()
        self.db.refresh(export)

        return export

    def get_session_exports(self, session_id: str) -> List[ResearchExport]:
        """Get all exports for a session."""
        return (
            self.db.query(ResearchExport)
            .filter(ResearchExport.session_id == session_id)
            .order_by(desc(ResearchExport.created_at))
            .all()
        )

    def delete_session(self, session_id: str) -> bool:
        """Delete a research session and its exports."""

        session = self.get_session(session_id)
        if not session:
            return False

        # Delete exports first
        self.db.query(ResearchExport).filter(
            ResearchExport.session_id == session_id
        ).delete()

        # Delete session
        self.db.delete(session)
        self.db.commit()

        return True

    def add_message(
        self, session_id: str, message_data: dict
    ) -> Optional[ResearchSession]:
        """Add a message to a research session."""
        session = self.get_session(session_id)
        if not session:
            return None

        # Initialize messages list if it doesn't exist
        if not session.messages:
            session.messages = []

        # Add the new message
        session.messages.append(message_data)
        session.updated_at = datetime.now()

        self.db.commit()
        self.db.refresh(session)

        return session


def get_research_session_service(db: Session = None) -> ResearchSessionService:
    """Get research session service instance."""
    if db is None:
        db = next(get_db())
    return ResearchSessionService(db)
