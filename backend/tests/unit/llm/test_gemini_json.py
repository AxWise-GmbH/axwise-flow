"""
Unit tests for the improved JSON parsing in GeminiLLMService.
These tests verify that the enhanced extraction methods can handle various
problematic JSON formats and edge cases.
"""

import pytest
import json
import os
import sys
from unittest.mock import patch, MagicMock
import re

# Import our adapter for testing
from backend.tests.mocks.gemini_adapter import GeminiAdapter

# Sample problematic JSON responses for testing
SAMPLE_RESPONSES = {
    "clean_json": '{"name": "UX Designer", "description": "Creative professional"}',
    
    "markdown_code_block": '```json\n{"name": "Product Manager", "description": "Product owner"}\n```',
    
    "text_with_json": 'Here is the response:\n{"name": "Data Analyst", "description": "Data professional"}\nEnd of response.',
    
    "escaped_quotes": '{"name": "Developer", "quote": "He said \\"coding is fun\\""}',
    
    "nested_json": '{"persona": {"name": "Engineer", "skills": ["coding", "design"]}}',
    
    "multiline_json": '{\n  "name": "Designer",\n  "skills": ["UI", "UX"]\n}',
    
    "malformed_json": 'This is not valid JSON content',
    
    "double_markdown": '```json\n```json\n{"name": "Double Nested"}\n```\n```'
}

class TestGeminiJsonParsing:
    """Test suite for the improved JSON parsing in GeminiLLMService."""
    
    @pytest.fixture
    def mock_logger(self):
        """Mock logger for testing."""
        with patch('backend.tests.mocks.gemini_adapter.logger') as mock_log:
            yield mock_log
    
    @pytest.fixture
    def adapter(self):
        """Create a GeminiAdapter instance for testing."""
        config = {"model": "gemini-test", "REDACTED_API_KEY": "dummy-key-for-testing"}
        return GeminiAdapter(config)
    
    def test_clean_json_extraction(self, adapter, mock_logger):
        """Test extraction of clean JSON."""
        result = adapter._extract_json(SAMPLE_RESPONSES["clean_json"])
        assert "name" in result
        assert result["name"] == "UX Designer"
        assert result["description"] == "Creative professional"
    
    def test_markdown_code_block_extraction(self, adapter, mock_logger):
        """Test extraction of JSON from markdown code blocks."""
        result = adapter._extract_json(SAMPLE_RESPONSES["markdown_code_block"])
        assert "name" in result
        assert result["name"] == "Product Manager"
        assert result["description"] == "Product owner"
    
    def test_text_with_json_extraction(self, adapter, mock_logger):
        """Test extraction of JSON embedded in text."""
        result = adapter._extract_json(SAMPLE_RESPONSES["text_with_json"])
        assert "name" in result
        assert result["name"] == "Data Analyst"
        assert result["description"] == "Data professional"
    
    def test_escaped_quotes_handling(self, adapter, mock_logger):
        """Test handling of escaped quotes in JSON."""
        result = adapter._extract_json(SAMPLE_RESPONSES["escaped_quotes"])
        assert "name" in result
        assert result["name"] == "Developer"
        assert result["quote"] == 'He said "coding is fun"'
    
    def test_nested_json_extraction(self, adapter, mock_logger):
        """Test extraction of nested JSON structures."""
        result = adapter._extract_json(SAMPLE_RESPONSES["nested_json"])
        assert "persona" in result
        assert result["persona"]["name"] == "Engineer"
        assert "coding" in result["persona"]["skills"]
    
    def test_multiline_json_extraction(self, adapter, mock_logger):
        """Test extraction of multi-line JSON."""
        result = adapter._extract_json(SAMPLE_RESPONSES["multiline_json"])
        assert "name" in result
        assert result["name"] == "Designer"
        assert "UI" in result["skills"]
    
    def test_fallback_behavior_for_invalid_json(self, adapter, mock_logger):
        """Test fallback behavior when JSON is invalid."""
        result = adapter._extract_json(SAMPLE_RESPONSES["malformed_json"])
        assert "error" in result
        assert "raw_response" in result
        assert result["raw_response"] == SAMPLE_RESPONSES["malformed_json"]
    
    def test_complex_nested_markdown(self, adapter, mock_logger):
        """Test extraction from complex nested markdown blocks."""
        result = adapter._extract_json(SAMPLE_RESPONSES["double_markdown"])
        assert "name" in result
        assert result["name"] == "Double Nested"


if __name__ == "__main__":
    # Run tests directly when script is executed
    pytest.main(["-v", __file__])
