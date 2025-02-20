"""
Tests for the FastAPI application endpoints.
"""

import pytest
import json
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock

from backend.models import AnalysisResult

def test_health_check(client):
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

class TestDataUpload:
    """Tests for the data upload endpoint."""

    def test_upload_no_auth(self, client):
        """Test data upload without authentication."""
        response = client.post("/api/data")
        assert response.status_code == 403
        assert "Not authenticated" in response.json()["detail"]

    def test_upload_invalid_file_type(self, client, auth_headers):
        """Test data upload with invalid file type."""
        response = client.post(
            "/api/data",
            headers=auth_headers,
            files={"file": ("test.txt", b"test content", "text/plain")}
        )
        assert response.status_code == 400
        assert "Invalid file type" in response.json()["detail"]

    def test_upload_invalid_json(self, client, auth_headers):
        """Test data upload with invalid JSON."""
        response = client.post(
            "/api/data",
            headers=auth_headers,
            files={"file": ("test.json", b"invalid json", "application/json")}
        )
        assert response.status_code == 400
        assert "Invalid JSON format" in response.json()["detail"]

    def test_upload_success(self, client, auth_headers, test_interview_data):
        """Test successful data upload."""
        response = client.post(
            "/api/data",
            headers=auth_headers,
            files={"file": ("test.json", json.dumps(test_interview_data), "application/json")}
        )
        assert response.status_code == 200
        data = response.json()
        assert "data_id" in data
        assert isinstance(data["data_id"], int)
        assert "message" in data
        assert str(data["data_id"]) in data["message"]

class TestAnalysis:
    """Tests for the analysis endpoint."""

    def test_analyze_no_auth(self, client):
        """Test analysis without authentication."""
        response = client.post("/api/analyze")
        assert response.status_code == 403
        assert "Not authenticated" in response.json()["detail"]

    def test_analyze_invalid_request(self, client, auth_headers):
        """Test analysis with invalid request body."""
        response = client.post(
            "/api/analyze",
            headers=auth_headers,
            json={"invalid": "data"}
        )
        assert response.status_code == 422
        data = response.json()
        assert "validation error" in data["detail"].lower()

    def test_analyze_invalid_model(self, client, auth_headers, uploaded_interview_data):
        """Test analysis with invalid model name."""
        response = client.post(
            "/api/analyze",
            headers=auth_headers,
            json={
                "data_id": uploaded_interview_data.data_id,
                "llm_provider": "openai",
                "llm_model": "invalid-model"
            }
        )
        assert response.status_code == 400
        assert "Invalid model name" in response.json()["detail"]

    def test_analyze_data_not_found(self, client, auth_headers):
        """Test analysis with non-existent data_id."""
        response = client.post(
            "/api/analyze",
            headers=auth_headers,
            json={
                "data_id": 99999,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06"
            }
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    @patch("backend.api.app.process_data")
    def test_analyze_success(
        self, mock_process_data, client, auth_headers, 
        uploaded_interview_data, db_session
    ):
        """Test successful analysis request."""
        # Mock the process_data function
        mock_results = {
            "themes": ["Theme 1", "Theme 2"],
            "sentiment": "positive",
            "patterns": ["Pattern 1"]
        }
        mock_process_data.return_value = mock_results

        response = client.post(
            "/api/analyze",
            headers=auth_headers,
            json={
                "data_id": uploaded_interview_data.data_id,
                "llm_provider": "openai",
                "llm_model": "gpt-4o-2024-08-06"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "result_id" in data
        assert isinstance(data["result_id"], int)
        assert "message" in data
        assert str(data["result_id"]) in data["message"]

class TestResults:
    """Tests for the results endpoint."""

    def test_get_results_no_auth(self, client):
        """Test getting results without authentication."""
        response = client.get("/api/results/1")
        assert response.status_code == 403
        assert "Not authenticated" in response.json()["detail"]

    def test_get_results_not_found(self, client, auth_headers):
        """Test getting non-existent results."""
        response = client.get(
            "/api/results/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_results_processing(
        self, client, auth_headers, uploaded_interview_data, db_session
    ):
        """Test getting results that are still processing."""
        # Create analysis result without results (processing state)
        analysis_result = AnalysisResult(
            data_id=uploaded_interview_data.data_id,
            llm_provider="openai",
            llm_model="gpt-4o-2024-08-06"
        )
        db_session.add(analysis_result)
        db_session.commit()

        response = client.get(
            f"/api/results/{analysis_result.result_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processing"
        assert "message" in data

    def test_get_results_error(
        self, client, auth_headers, uploaded_interview_data, db_session
    ):
        """Test getting results with error."""
        # Create analysis result with error
        analysis_result = AnalysisResult(
            data_id=uploaded_interview_data.data_id,
            llm_provider="openai",
            llm_model="gpt-4o-2024-08-06",
            results={"error": "Test error message"}
        )
        db_session.add(analysis_result)
        db_session.commit()

        response = client.get(
            f"/api/results/{analysis_result.result_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert data["error"] == "Test error message"

    def test_get_results_success(
        self, client, auth_headers, uploaded_interview_data, db_session
    ):
        """Test getting completed results."""
        # Create analysis result with successful results
        test_results = {
            "themes": ["Theme 1", "Theme 2"],
            "sentiment": "positive",
            "patterns": ["Pattern 1"]
        }
        analysis_result = AnalysisResult(
            data_id=uploaded_interview_data.data_id,
            llm_provider="openai",
            llm_model="gpt-4o-2024-08-06",
            results=test_results
        )
        db_session.add(analysis_result)
        db_session.commit()

        response = client.get(
            f"/api/results/{analysis_result.result_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert data["result_id"] == analysis_result.result_id
        assert data["results"] == test_results
        assert data["llm_provider"] == "openai"
        assert data["llm_model"] == "gpt-4o-2024-08-06"