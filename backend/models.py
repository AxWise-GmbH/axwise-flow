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
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)  # From Clerk
    email = Column(String)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    stripe_customer_id = Column(String, nullable=True)  # Phase 5
    subscription_status = Column(String, nullable=True)  # Phase 5
    subscription_id = Column(String, nullable=True)  # Phase 5
    usage_data = Column(JSON, nullable=True)

    interviews = relationship("InterviewData", back_populates="user")


class InterviewData(Base):
    __tablename__ = "interview_data"

    id = Column(Integer, primary_key=True, autoincrement=True)

    @property
    def data_id(self):
        return self.id

    @data_id.setter
    def data_id(self, value):
        self.id = value

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

    user = relationship("User", back_populates="interviews")
    analysis_results = relationship("AnalysisResult", back_populates="interview_data")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    result_id = Column(Integer, primary_key=True, autoincrement=True)

    @property
    def id(self):
        return self.result_id

    @id.setter
    def id(self, value):
        self.result_id = value

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

    interview_data = relationship("InterviewData", back_populates="analysis_results")
    personas = relationship("Persona", back_populates="analysis_result")


class Persona(Base):
    __tablename__ = "personas"

    persona_id = Column(Integer, primary_key=True, autoincrement=True)
    result_id = Column(Integer, ForeignKey("analysis_results.result_id"))
    name = Column(String)
    description = Column(Text, nullable=True)  # Add description field

    # Fields to store PersonaTrait JSON objects
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

    analysis_result = relationship("AnalysisResult", back_populates="personas")
