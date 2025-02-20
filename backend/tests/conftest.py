"""
PyTest configuration and fixtures.
"""

import pytest
import json
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.database import Base, get_db
from backend.api.app import app
from backend.models import User, InterviewData

# Test database URL
SQLALCHEMY_TEST_REDACTED_DATABASE_URL=***REDACTED***

# Create test database engine
engine = create_engine(
    SQLALCHEMY_TEST_REDACTED_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
)

# Create test database session
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session")
def test_db():
    """Create test database tables."""
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(test_db):
    """Get database session for each test."""
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client(db_session):
    """Create test client with database dependency override."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

@pytest.fixture
def test_user(db_session):
    """Create test user."""
    user = User(
        user_id="test_user_123",
        email="test@example.com"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user

@pytest.fixture
def auth_headers():
    """Get authentication headers."""
    return {"Authorization": "Bearer test_user_123"}

@pytest.fixture
def test_interview_data():
    """Load test interview data from fixture file."""
    fixture_path = Path(__file__).parent / "fixtures" / "test_interview_data.json"
    with open(fixture_path, "r") as f:
        return json.load(f)

@pytest.fixture
def uploaded_interview_data(db_session, test_user, test_interview_data):
    """Create test interview data in database."""
    interview_data = InterviewData(
        user_id=test_user.user_id,
        input_type="json",
        original_data=json.dumps(test_interview_data),
        filename="test_interview.json"
    )
    db_session.add(interview_data)
    db_session.commit()
    db_session.refresh(interview_data)
    return interview_data