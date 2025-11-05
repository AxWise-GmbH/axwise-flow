"""
Tests for Jira export functionality.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from backend.models.jira_export import (
    JiraCredentials,
    JiraExportRequest,
    JiraConnectionTestRequest,
)
from backend.services.export.jira_exporter import JiraExporter


@pytest.fixture
def mock_db():
    """Mock database session."""
    return Mock()


@pytest.fixture
def mock_user():
    """Mock user."""
    user = Mock()
    user.user_id = 1
    user.email = "test@example.com"
    return user


@pytest.fixture
def jira_credentials():
    """Sample Jira credentials."""
    return JiraCredentials(
        jira_url="https://test.atlassian.net",
        email="test@example.com",
        api_token="test-token",
        project_key="TEST"
    )


@pytest.fixture
def jira_exporter(mock_db, mock_user):
    """Create JiraExporter instance."""
    return JiraExporter(mock_db, mock_user)


def test_jira_credentials_validation():
    """Test Jira credentials validation."""
    credentials = JiraCredentials(
        jira_url="https://test.atlassian.net",
        email="test@example.com",
        api_token="test-token",
        project_key="TEST"
    )
    
    assert credentials.jira_url == "https://test.atlassian.net"
    assert credentials.email == "test@example.com"
    assert credentials.api_token == "test-token"
    assert credentials.project_key == "TEST"


def test_jira_export_request_validation():
    """Test Jira export request validation."""
    credentials = JiraCredentials(
        jira_url="https://test.atlassian.net",
        email="test@example.com",
        api_token="test-token",
        project_key="TEST"
    )
    
    request = JiraExportRequest(
        result_id=123,
        credentials=credentials,
        epic_name="Test Epic",
        include_technical=True,
        include_acceptance_criteria=True
    )
    
    assert request.result_id == 123
    assert request.epic_name == "Test Epic"
    assert request.include_technical is True
    assert request.include_acceptance_criteria is True


def test_get_auth_headers(jira_exporter, jira_credentials):
    """Test authentication headers generation."""
    headers = jira_exporter._get_auth_headers(jira_credentials)
    
    assert "Authorization" in headers
    assert headers["Authorization"].startswith("Basic ")
    assert headers["Content-Type"] == "application/json"
    assert headers["Accept"] == "application/json"


@patch('backend.services.export.jira_exporter.requests.get')
def test_test_connection_success(mock_get, jira_exporter, jira_credentials):
    """Test successful Jira connection."""
    # Mock user response
    user_response = Mock()
    user_response.status_code = 200
    user_response.json.return_value = {"displayName": "Test User"}
    
    # Mock project response
    project_response = Mock()
    project_response.status_code = 200
    project_response.json.return_value = {"name": "Test Project"}
    
    # Configure mock to return different responses
    mock_get.side_effect = [user_response, project_response]
    
    result = jira_exporter.test_connection(jira_credentials)
    
    assert result.success is True
    assert result.user_name == "Test User"
    assert result.project_name == "Test Project"
    assert "successful" in result.message.lower()


@patch('backend.services.export.jira_exporter.requests.get')
def test_test_connection_auth_failure(mock_get, jira_exporter, jira_credentials):
    """Test Jira connection with authentication failure."""
    # Mock failed authentication
    user_response = Mock()
    user_response.status_code = 401
    user_response.text = "Unauthorized"
    
    mock_get.return_value = user_response
    
    result = jira_exporter.test_connection(jira_credentials)
    
    assert result.success is False
    assert "Authentication failed" in result.message


@patch('backend.services.export.jira_exporter.requests.get')
def test_test_connection_project_access_failure(mock_get, jira_exporter, jira_credentials):
    """Test Jira connection with project access failure."""
    # Mock successful user auth but failed project access
    user_response = Mock()
    user_response.status_code = 200
    user_response.json.return_value = {"displayName": "Test User"}
    
    project_response = Mock()
    project_response.status_code = 404
    project_response.text = "Project not found"
    
    mock_get.side_effect = [user_response, project_response]
    
    result = jira_exporter.test_connection(jira_credentials)
    
    assert result.success is False
    assert "Project access failed" in result.message


@patch('backend.services.export.jira_exporter.requests.post')
def test_create_epic_success(mock_post, jira_exporter, jira_credentials):
    """Test successful epic creation."""
    # Mock successful epic creation
    response = Mock()
    response.status_code = 201
    response.json.return_value = {
        "key": "TEST-100",
        "id": "10001"
    }
    
    mock_post.return_value = response
    
    epic = jira_exporter._create_epic(
        jira_credentials,
        "Test Epic",
        "Test Description"
    )
    
    assert epic is not None
    assert epic.key == "TEST-100"
    assert epic.id == "10001"
    assert epic.issue_type == "Epic"
    assert "TEST-100" in epic.url


@patch('backend.services.export.jira_exporter.requests.post')
def test_create_epic_failure(mock_post, jira_exporter, jira_credentials):
    """Test failed epic creation."""
    # Mock failed epic creation
    response = Mock()
    response.status_code = 400
    response.text = "Bad Request"
    
    mock_post.return_value = response
    
    epic = jira_exporter._create_epic(
        jira_credentials,
        "Test Epic",
        "Test Description"
    )
    
    assert epic is None


@patch('backend.services.export.jira_exporter.requests.post')
def test_create_story_success(mock_post, jira_exporter, jira_credentials):
    """Test successful story creation."""
    # Mock successful story creation
    response = Mock()
    response.status_code = 201
    response.json.return_value = {
        "key": "TEST-101",
        "id": "10002"
    }
    
    mock_post.return_value = response
    
    story = jira_exporter._create_story(
        jira_credentials,
        "Test Story",
        "Test Description",
        epic_key="TEST-100"
    )
    
    assert story is not None
    assert story.key == "TEST-101"
    assert story.id == "10002"
    assert story.issue_type == "Story"


@patch('backend.services.export.jira_exporter.requests.post')
def test_create_task_success(mock_post, jira_exporter, jira_credentials):
    """Test successful task creation."""
    # Mock successful task creation
    response = Mock()
    response.status_code = 201
    response.json.return_value = {
        "key": "TEST-102",
        "id": "10003"
    }
    
    mock_post.return_value = response
    
    task = jira_exporter._create_task(
        jira_credentials,
        "Test Task",
        "Test Description",
        parent_key="TEST-101"
    )
    
    assert task is not None
    assert task.key == "TEST-102"
    assert task.id == "10003"
    assert task.issue_type == "Sub-task"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

