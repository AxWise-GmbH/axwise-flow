from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    JSON,
    ForeignKey,
    Text,
    Float,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, sessionmaker, foreign
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

# Import Base from database.py to ensure we use the same Base instance
from backend.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    user_id = Column(String, primary_key=True)  # From Clerk
    email = Column(String)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    stripe_customer_id = Column(String, nullable=True)  # Phase 5
    subscription_status = Column(String, nullable=True)  # Phase 5
    subscription_id = Column(String, nullable=True)  # Phase 5
    usage_data = Column(JSON, nullable=True)

    interviews = relationship("InterviewData", viewonly=True)


class InterviewData(Base):
    __tablename__ = "interview_data"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Add data_id as an alias for id for backward compatibility
    @property
    def data_id(self):
        return self.id

    user_id = Column(String, ForeignKey("users.user_id"))
    upload_date = Column(DateTime, default=datetime.utcnow)
    filename = Column(String, nullable=True)
    input_type = Column(String)  # "text", "csv", "json"
    original_data = Column(Text)

    @property
    def transformed_data(self):
        return None

    @transformed_data.setter
    def transformed_data(self, value):
        pass  # Ignore for now

    user = relationship("User", viewonly=True)
    analysis_results = relationship(
        "AnalysisResult",
        viewonly=True,
    )


class AnalysisResult(Base):
    __tablename__ = "analysis_results"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    result_id = Column(Integer, primary_key=True, autoincrement=True)

    # Add id as an alias for result_id for backward compatibility
    @property
    def id(self):
        return self.result_id

    data_id = Column(Integer, ForeignKey("interview_data.id"))

    @property
    def interview_data_id(self):
        return self.data_id

    @interview_data_id.setter
    def interview_data_id(self, value):
        self.data_id = value

    analysis_date = Column(DateTime, default=datetime.utcnow)

    @property
    def created_at(self):
        return self.analysis_date

    @created_at.setter
    def created_at(self, value):
        self.analysis_date = value

    completed_at = Column(DateTime, nullable=True)
    results = Column(JSON)

    @property
    def result_data(self):
        if self.results:
            import json

            return json.dumps(self.results)
        return None

    @result_data.setter
    def result_data(self, value):
        if value:
            import json

            try:
                self.results = json.loads(value)
            except:
                self.results = {"raw_text": value}

    llm_provider = Column(String)
    llm_model = Column(String)
    status = Column(
        String, default="processing"
    )  # possible values: processing, completed, failed
    error_message = Column(Text, nullable=True)  # For compatibility

    # NEW: Multi-stakeholder intelligence support
    stakeholder_intelligence = Column(JSONB, nullable=True)

    interview_data = relationship(
        "InterviewData",
        viewonly=True,
    )
    personas = relationship("Persona", viewonly=True)
    cached_prds = relationship("CachedPRD", viewonly=True)


class Persona(Base):
    __tablename__ = "personas"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    persona_id = Column(Integer, primary_key=True, autoincrement=True)
    result_id = Column(Integer, ForeignKey("analysis_results.result_id"))
    name = Column(String)
    archetype = Column(String, nullable=True)  # New field
    description = Column(Text, nullable=True)  # Add description field

    # New fields to store PersonaTrait JSON objects
    demographics = Column(JSON, nullable=True)
    goals_and_motivations = Column(JSON, nullable=True)
    skills_and_expertise = Column(JSON, nullable=True)
    workflow_and_environment = Column(JSON, nullable=True)
    challenges_and_frustrations = Column(JSON, nullable=True)
    needs_and_desires = Column(JSON, nullable=True)
    technology_and_tools = Column(JSON, nullable=True)
    attitude_towards_research = Column(JSON, nullable=True)
    attitude_towards_ai = Column(JSON, nullable=True)
    key_quotes = Column(JSON, nullable=True)

    # Legacy fields to store PersonaTrait JSON objects
    role_context = Column(JSON, nullable=True)
    key_responsibilities = Column(JSON, nullable=True)
    tools_used = Column(JSON, nullable=True)
    collaboration_style = Column(JSON, nullable=True)  # Ensure this exists and is JSON
    analysis_approach = Column(JSON, nullable=True)  # Ensure this exists and is JSON
    pain_points = Column(JSON, nullable=True)  # Ensure this exists and is JSON

    # Fields for lists/simple values
    patterns = Column(JSON, nullable=True)  # Stores List[str]
    confidence = Column(Float, nullable=True)  # Renamed from confidence_score
    evidence = Column(JSON, nullable=True)  # Stores List[str] for overall evidence
    persona_metadata = Column(JSON, nullable=True)  # Renamed back from metadata

    # New fields for overall persona information
    overall_confidence = Column(Float, nullable=True)  # New field
    supporting_evidence_summary = Column(JSON, nullable=True)  # New field

    analysis_result = relationship("AnalysisResult", viewonly=True)


class CachedPRD(Base):
    """
    Model for storing cached PRD data.
    """

    __tablename__ = "cached_prds"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(
        Integer, ForeignKey("analysis_results.result_id"), nullable=False
    )
    prd_type = Column(
        String(20), nullable=False
    )  # 'operational', 'technical', or 'both'
    prd_data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to AnalysisResult
    analysis_result = relationship("AnalysisResult", viewonly=True)

    class Config:
        """Pydantic config"""

        orm_mode = True


class SimulationData(Base):
    """
    Model for storing simulation results with proper persistence.
    """

    __tablename__ = "simulation_data"
    __table_args__ = {"extend_existing": True}
    __module__ = "backend.models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    simulation_id = Column(String, unique=True, nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    status = Column(String, default="pending")  # pending, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Configuration and context
    business_context = Column(JSON)
    questions_data = Column(JSON)
    simulation_config = Column(JSON)

    # Results
    personas = Column(JSON)  # List of generated personas
    interviews = Column(JSON)  # List of completed interviews
    insights = Column(JSON)  # Generated insights
    formatted_data = Column(JSON)  # Analysis-ready data

    # Metadata
    total_personas = Column(Integer, default=0)
    total_interviews = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)

    user = relationship("User", viewonly=True)

    @property
    def duration_minutes(self):
        if self.completed_at and self.created_at:
            return int((self.completed_at - self.created_at).total_seconds() / 60)
        return None
