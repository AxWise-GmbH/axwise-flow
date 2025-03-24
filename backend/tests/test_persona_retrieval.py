"""
Test script to verify that personas are being retrieved from the database.
"""

import json
import logging
import pytest
from datetime import datetime
from sqlalchemy.orm import Session

from backend.models import User, InterviewData, AnalysisResult, Persona
from backend.services.results_service import ResultsService
from backend.schemas import Persona as PersonaSchema

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@pytest.fixture
def test_user():
    """Create a test user"""
    return User(
        user_id="test_user_id",
        email="test@example.com"
    )

@pytest.fixture
def test_interview_data(test_user, db: Session):
    """Create test interview data"""
    interview = InterviewData(
        user_id=test_user.user_id,
        upload_date=datetime.utcnow(),
        filename="test_interview.txt",
        input_type="text",
        original_data="This is a test interview."
    )
    db.add(interview)
    db.commit()
    return interview

@pytest.fixture
def test_analysis_result(test_interview_data, db: Session):
    """Create a test analysis result"""
    result = AnalysisResult(
        data_id=test_interview_data.data_id,
        analysis_date=datetime.utcnow(),
        completed_at=datetime.utcnow(),
        results=json.dumps({
            "themes": [],
            "patterns": [],
            "sentiment": [],
            "sentimentOverview": {"positive": 0.5, "neutral": 0.3, "negative": 0.2},
            "insights": []
        }),
        llm_provider="test",
        llm_model="test-model",
        status="completed"
    )
    db.add(result)
    db.commit()
    return result

@pytest.fixture
def test_personas(test_analysis_result, db: Session):
    """Create test personas"""
    personas = [
        Persona(
            result_id=test_analysis_result.result_id,
            name="Test Persona 1",
            demographics=json.dumps({"age": "25-34", "role": "Developer"}),
            goals=json.dumps(["Improve skills", "Build applications"]),
            pain_points=json.dumps(["Legacy code", "Tight deadlines"]),
            behaviors=json.dumps({"tools": ["VS Code", "Git"]}),
            quotes=json.dumps(["I love coding", "Testing is important"]),
            confidence_score=0.85,
            collaboration_style=json.dumps({"style": "Collaborative"}),
            analysis_approach=json.dumps({"method": "Data-driven"}),
            patterns=json.dumps(["Pattern 1", "Pattern 2"]),
            evidence=json.dumps(["Evidence 1", "Evidence 2"]),
            persona_metadata=json.dumps({"source": "interview"})
        ),
        Persona(
            result_id=test_analysis_result.result_id,
            name="Test Persona 2",
            demographics=json.dumps({"age": "35-44", "role": "Designer"}),
            goals=json.dumps(["Create beautiful UIs", "Improve UX"]),
            pain_points=json.dumps(["Limited resources", "Too many stakeholders"]),
            behaviors=json.dumps({"tools": ["Figma", "Sketch"]}),
            quotes=json.dumps(["Design matters", "User experience is key"]),
            confidence_score=0.9,
            collaboration_style=json.dumps({"style": "Independent"}),
            analysis_approach=json.dumps({"method": "User-centric"}),
            patterns=json.dumps(["Pattern A", "Pattern B"]),
            evidence=json.dumps(["Evidence A", "Evidence B"]),
            persona_metadata=json.dumps({"source": "interview"})
        )
    ]
    
    for persona in personas:
        db.add(persona)
    db.commit()
    return personas

def test_persona_retrieval(test_user, test_analysis_result, test_personas, db: Session):
    """Test that personas are properly retrieved from the database"""
    # Initialize the service
    service = ResultsService(db, test_user)
    
    # Get the analysis result
    result = service.get_analysis_result(test_analysis_result.result_id)
    
    # Check that personas were retrieved
    assert "personas" in result["results"]
    personas = result["results"]["personas"]
    
    # Verify we got the expected number of personas
    assert len(personas) == len(test_personas)
    
    # Verify persona data
    for persona in personas:
        # Verify it's a Persona object
        assert isinstance(persona, PersonaSchema)
        
        # Verify persona fields
        assert persona.name in ["Test Persona 1", "Test Persona 2"]
        
        # Check that complex values are properly handled
        if persona.name == "Test Persona 1":
            assert "Developer" in str(persona.role_context.value)
            assert "Improve skills" in str(persona.key_responsibilities.value)
        else:
            assert "Designer" in str(persona.role_context.value)
            assert "Create beautiful UIs" in str(persona.key_responsibilities.value)
    
    logger.info("✅ Persona retrieval test passed successfully") 