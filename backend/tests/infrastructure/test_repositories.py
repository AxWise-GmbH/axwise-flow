"""
Tests for repository implementations.

This module contains tests for the repository implementations to ensure they
correctly implement the repository interfaces.
"""

import pytest
import asyncio
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models import User, InterviewData, AnalysisResult
from backend.infrastructure.persistence.interview_repository import InterviewRepository
from backend.infrastructure.persistence.analysis_repository import AnalysisRepository
from backend.infrastructure.persistence.unit_of_work import UnitOfWork

# Create an in-memory SQLite database for testing
@pytest.fixture
def engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return engine

@pytest.fixture
def session_factory(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture
def session(session_factory):
    session = session_factory()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def user(session):
    user = User(
        user_id="test-user-id",
        email="test@example.com",
        first_name="Test",
        last_name="User"
    )
    session.add(user)
    session.commit()
    return user

@pytest.fixture
def interview_repository(session):
    return InterviewRepository(session)

@pytest.fixture
def analysis_repository(session):
    return AnalysisRepository(session)

@pytest.fixture
def unit_of_work(session_factory):
    return UnitOfWork(session_factory)

# Test InterviewRepository
@pytest.mark.asyncio
async def test_interview_repository_save(interview_repository, user):
    # Arrange
    user_id = user.user_id
    filename = "test.txt"
    input_type = "free_text"
    content = "This is a test interview"
    
    # Act
    data_id = await interview_repository.save(user_id, filename, input_type, content)
    
    # Assert
    assert data_id is not None
    assert data_id > 0

@pytest.mark.asyncio
async def test_interview_repository_get_by_id(interview_repository, user):
    # Arrange
    user_id = user.user_id
    filename = "test.txt"
    input_type = "free_text"
    content = "This is a test interview"
    data_id = await interview_repository.save(user_id, filename, input_type, content)
    
    # Act
    result = await interview_repository.get_by_id(data_id, user_id)
    
    # Assert
    assert result is not None
    assert result["id"] == data_id
    assert result["user_id"] == user_id
    assert result["filename"] == filename
    assert result["input_type"] == input_type
    assert result["content"] == content

@pytest.mark.asyncio
async def test_interview_repository_list_by_user(interview_repository, user):
    # Arrange
    user_id = user.user_id
    await interview_repository.save(user_id, "test1.txt", "free_text", "Interview 1")
    await interview_repository.save(user_id, "test2.txt", "free_text", "Interview 2")
    
    # Act
    results = await interview_repository.list_by_user(user_id)
    
    # Assert
    assert len(results) == 2
    assert results[0]["user_id"] == user_id
    assert results[1]["user_id"] == user_id

@pytest.mark.asyncio
async def test_interview_repository_delete(interview_repository, user):
    # Arrange
    user_id = user.user_id
    data_id = await interview_repository.save(user_id, "test.txt", "free_text", "Test")
    
    # Act
    result = await interview_repository.delete(data_id, user_id)
    
    # Assert
    assert result is True
    result = await interview_repository.get_by_id(data_id, user_id)
    assert result is None

# Test AnalysisRepository
@pytest.mark.asyncio
async def test_analysis_repository_create(analysis_repository, interview_repository, user):
    # Arrange
    user_id = user.user_id
    data_id = await interview_repository.save(user_id, "test.txt", "free_text", "Test")
    llm_provider = "test-provider"
    llm_model = "test-model"
    
    # Act
    result_id = await analysis_repository.create(user_id, data_id, llm_provider, llm_model)
    
    # Assert
    assert result_id is not None
    assert result_id > 0

@pytest.mark.asyncio
async def test_analysis_repository_get_by_id(analysis_repository, interview_repository, user):
    # Arrange
    user_id = user.user_id
    data_id = await interview_repository.save(user_id, "test.txt", "free_text", "Test")
    llm_provider = "test-provider"
    llm_model = "test-model"
    result_id = await analysis_repository.create(user_id, data_id, llm_provider, llm_model)
    
    # Act
    result = await analysis_repository.get_by_id(result_id, user_id)
    
    # Assert
    assert result is not None
    assert result["result_id"] == result_id
    assert result["data_id"] == data_id
    assert result["user_id"] == user_id
    assert result["llm_provider"] == llm_provider
    assert result["llm_model"] == llm_model
    assert result["status"] == "processing"

@pytest.mark.asyncio
async def test_analysis_repository_update_status(analysis_repository, interview_repository, user):
    # Arrange
    user_id = user.user_id
    data_id = await interview_repository.save(user_id, "test.txt", "free_text", "Test")
    result_id = await analysis_repository.create(user_id, data_id, "test-provider", "test-model")
    
    # Act
    success = await analysis_repository.update_status(
        result_id, user_id, "completed", 1.0, "Analysis completed"
    )
    
    # Assert
    assert success is True
    result = await analysis_repository.get_by_id(result_id, user_id)
    assert result["status"] == "completed"
    assert result["results"]["status"] == "completed"
    assert result["results"]["progress"] == 1.0
    assert result["results"]["message"] == "Analysis completed"

# Test UnitOfWork
@pytest.mark.asyncio
async def test_unit_of_work_commit(unit_of_work, user):
    # Arrange
    user_id = user.user_id
    
    # Act
    with unit_of_work as uow:
        await uow.interviews.save(user_id, "test.txt", "free_text", "Test")
        uow.commit()
    
    # Assert
    with unit_of_work as uow:
        results = await uow.interviews.list_by_user(user_id)
        assert len(results) == 1

@pytest.mark.asyncio
async def test_unit_of_work_rollback(unit_of_work, user):
    # Arrange
    user_id = user.user_id
    
    # Act
    try:
        with unit_of_work as uow:
            await uow.interviews.save(user_id, "test.txt", "free_text", "Test")
            # Simulate an error
            raise ValueError("Test error")
    except ValueError:
        pass
    
    # Assert
    with unit_of_work as uow:
        results = await uow.interviews.list_by_user(user_id)
        assert len(results) == 0
