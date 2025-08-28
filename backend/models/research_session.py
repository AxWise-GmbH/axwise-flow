"""
Research Session Models for Customer Research Feature
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    Boolean,
    ForeignKey,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

# Import the shared Base from database.py
from backend.database import Base


class ResearchSession(Base):
    """Database model for research sessions."""

    __tablename__ = "research_sessions"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)  # From Clerk auth when implemented
    session_id = Column(String, unique=True, index=True)

    # Business context
    business_idea = Column(Text)
    target_customer = Column(Text)
    problem = Column(Text)
    industry = Column(String, default="general")

    # Session metadata
    stage = Column(
        String, default="initial"
    )  # initial, business_idea, target_customer, validation, completed
    status = Column(String, default="active")  # active, completed, abandoned

    # Conversation data
    messages = Column(JSON)  # List of message objects
    conversation_context = Column(Text)

    # Generated questions
    questions_generated = Column(Boolean, default=False)
    research_questions = Column(JSON)  # ResearchQuestions object

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Note: exports are now handled via Pydantic models, not SQLAlchemy relationships


# Pydantic model for research exports
class ResearchExport(BaseModel):
    """Pydantic model for research exports."""

    id: Optional[int] = None
    session_id: str
    export_type: str  # pdf, csv, email, txt
    export_format: str  # detailed, summary, questions_only
    file_path: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# Pydantic models for API
class ResearchSessionCreate(BaseModel):
    session_id: Optional[str] = None  # Allow custom session_id for local session sync
    user_id: Optional[str] = None
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    problem: Optional[str] = None
    industry: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    conversation_context: Optional[str] = None
    questions_generated: Optional[bool] = None


class ResearchSessionUpdate(BaseModel):
    business_idea: Optional[str] = None
    target_customer: Optional[str] = None
    problem: Optional[str] = None
    industry: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    conversation_context: Optional[str] = None
    questions_generated: Optional[bool] = None
    research_questions: Optional[Dict[str, Any]] = None
    completed_at: Optional[datetime] = None


class ResearchSessionResponse(BaseModel):
    id: int
    session_id: str
    user_id: Optional[str]
    business_idea: Optional[str]
    target_customer: Optional[str]
    problem: Optional[str]
    industry: str
    stage: str
    status: str
    questions_generated: bool
    messages: Optional[List[Dict[str, Any]]] = []
    conversation_context: Optional[str] = None
    research_questions: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class ResearchSessionSummary(BaseModel):
    """Summary model for dashboard display."""

    id: str  # Use session_id as the main id for frontend compatibility
    session_id: str
    title: str  # Derived from business_idea
    business_idea: Optional[str]
    target_customer: Optional[str]
    problem: Optional[str]
    industry: str
    stage: str
    status: str
    questions_generated: bool
    has_questionnaire: bool  # Same as questions_generated
    questionnaire_exported: bool  # Based on exports
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime]
    message_count: int
    question_count: int  # Count of questions in research_questions
    stakeholder_count: int  # Count of stakeholders in research_questions
    last_message_at: Optional[datetime]  # Last message timestamp
    messages: Optional[List[Dict[str, Any]]] = (
        []
    )  # Include messages for frontend compatibility
    research_questions: Optional[Dict[str, Any]] = (
        None  # Include research questions for frontend compatibility
    )

    class Config:
        from_attributes = True
