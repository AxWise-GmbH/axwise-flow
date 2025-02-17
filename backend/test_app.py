"""
Tests for the FastAPI application endpoints in app.py.
"""

import pytest
from fastapi.testclient import TestClient
from fastapi import UploadFile
from unittest.mock import AsyncMock, patch
from services.external.auth_provider import AuthProvider
from backend.app import app, get_auth_provider  # Corrected import


# Mock AuthProvider for testing
class MockAuthProvider(AuthProvider):
    async def authenticate(self, request):
        return {"user_id": "testuser", "email": "test@example.com"}

@pytest.fixture
def client():
    # Override the dependency
    app.dependency_overrides[get_auth_provider] = lambda: MockAuthProvider()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear() # Clean up after test


def test_upload_data_success(client):
    # Mock the file content
    file_content = b'{"key": "value"}'
    file = UploadFile(filename="test.json", file=file_content)
    file.content_type = "application/json"

    response = client.post("/api/data", files={"file": (file.filename, file_content, file.content_type)})
    assert response.status_code == 200
    assert response.json() == {"data_id": 123, "message": "Data uploaded successfully."}

def test_upload_data_invalid_file_type(client):
    file_content = b"some text"
    file = UploadFile(filename="test.txt", file=file_content)
    file.content_type = "text/plain"

    response = client.post("/api/data", files={"file": (file.filename, file_content, file.content_type)})
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid file type. Must be JSON."}

def test_upload_data_invalid_json(client):
    file_content = b"invalid json"
    file = UploadFile(filename="test.json", file=file_content)
    file.content_type = "application/json"

    response = client.post("/api/data", files={"file": (file.filename, file_content, file.content_type)})
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid JSON format."}


@patch('backend.app.process_data', new_callable=AsyncMock)  # Corrected patch
def test_analyze_data_success(mock_process_data, client):
    mock_process_data.return_value = {"result": "some result"}
    response = client.post("/api/analyze", json={"data_id": "123", "llm_provider": "openai"})
    assert response.status_code == 200
    assert response.json() == {"result_id": 456, "message": "Analysis started."}
    mock_process_data.assert_called_once()

def test_analyze_data_missing_data_id(client):
    response = client.post("/api/analyze", json={"llm_provider": "openai"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Missing data_id or llm_provider."}

def test_analyze_data_missing_llm_provider(client):
    response = client.post("/api/analyze", json={"data_id": "123"})
    assert response.status_code == 400
    assert response.json() == {"detail": "Missing data_id or llm_provider."}

@patch('backend.app.process_data', new_callable=AsyncMock)  # Corrected patch
def test_get_results_success(mock_process_data, client):
    # Mock process_data (even though it's not directly called in get_results)
    mock_process_data.return_value = {"some": "result"}

    response = client.get("/api/results/456")
    assert response.status_code == 200
    # Check for the placeholder response.  In a real implementation, this would
    # retrieve data from a database, and we'd mock the database interaction.
    assert response.json()["result_id"] == 456