"""
Unit tests for StakeholderAnalysisV2 Detector Module

Tests stakeholder detection functionality and strategies.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from typing import List, Dict, Any

from backend.services.stakeholder_analysis_v2.detector import StakeholderDetector
from backend.schemas import DetectedStakeholder


class MockLLMService:
    """Mock LLM service for testing."""

    async def generate_text(self, prompt: str, **kwargs) -> str:
        return "Mock LLM response"

    async def generate_structured(self, prompt: str, response_model, **kwargs):
        return Mock()

    def get_model_info(self) -> Dict[str, Any]:
        return {"model": "mock-model", "provider": "mock"}


@pytest.fixture
def mock_llm_service():
    """Fixture for mock LLM service."""
    return MockLLMService()


@pytest.fixture
def stakeholder_detector(mock_llm_service):
    """Fixture for StakeholderDetector."""
    return StakeholderDetector(mock_llm_service)


@pytest.fixture
def sample_personas():
    """Fixture for sample personas."""
    return [
        {
            "name": "John Doe",
            "role": "Product Manager",
            "stakeholder_intelligence": {"stakeholder_type": "Product Owner"},
            "goals_and_motivations": {
                "value": "Improve user experience",
                "evidence": ["Quote about UX"],
            },
            "challenges_and_frustrations": {
                "value": "Limited resources",
                "evidence": ["Quote about resources"],
            },
        },
        {
            "name": "Jane Smith",
            "role": "Developer",
            "demographics": "Senior Software Engineer",
            "goals_and_motivations": "Build scalable systems",
            "challenges_and_frustrations": "Technical debt",
        },
    ]


@pytest.fixture
def sample_base_analysis():
    """Fixture for sample base analysis."""
    return Mock(
        themes=[{"theme": "User Experience"}],
        patterns=[],
        model_dump=Mock(return_value={"themes": [{"theme": "User Experience"}]}),
    )


@pytest.fixture
def sample_files():
    """Fixture for sample files."""
    return [
        (
            "Sample interview content about product development and user needs. "
            "We discussed multiple stakeholders including product managers, end users, "
            "and influential advisors across departments. This transcript contains enough "
            "detail to trigger LLM-based detection logic in the detector."
        )
    ]


class TestStakeholderDetector:
    """Test cases for StakeholderDetector."""

    def test_detector_initialization(self, mock_llm_service):
        """Test that detector initializes correctly."""
        detector = StakeholderDetector(mock_llm_service)

        assert detector.llm_service == mock_llm_service
        assert detector.legacy_detector is not None

    @pytest.mark.asyncio
    async def test_detect_stakeholders_from_personas(
        self, stakeholder_detector, sample_personas, sample_base_analysis, sample_files
    ):
        """Test stakeholder detection from personas."""

        result = await stakeholder_detector.detect_stakeholders(
            sample_files, sample_base_analysis, personas=sample_personas
        )

        # Should extract stakeholders from personas
        assert len(result) == 2
        assert all(isinstance(s, DetectedStakeholder) for s in result)

        # Check first stakeholder
        stakeholder1 = result[0]
        assert stakeholder1.stakeholder_type in {
            "decision_maker",
            "primary_customer",
            "secondary_user",
            "influencer",
        }
        assert stakeholder1.confidence_score >= 0.5
        assert stakeholder1.individual_insights.get("name") == "John Doe"
        assert stakeholder1.individual_insights.get("role") == "Product Manager"
        concerns = stakeholder1.individual_insights.get("key_concerns", [])
        assert any("Improve user experience" in c for c in concerns)

    @pytest.mark.asyncio
    async def test_detect_stakeholders_with_llm_fallback(
        self, stakeholder_detector, sample_base_analysis, sample_files
    ):
        """Test stakeholder detection with LLM fallback when no personas."""

        with patch.object(
            stakeholder_detector, "_detect_with_llm", new_callable=AsyncMock
        ) as mock_llm_detect:
            mock_stakeholder = DetectedStakeholder(
                stakeholder_id="llm_stakeholder_1",
                stakeholder_type="primary_customer",
                confidence_score=0.8,
                demographic_profile=None,
                individual_insights={
                    "name": "LLM Detected User",
                    "role": "End User",
                    "key_concerns": ["Usability"],
                    "source": "llm_detection",
                },
            )
            mock_llm_detect.return_value = [mock_stakeholder]

            result = await stakeholder_detector.detect_stakeholders(
                sample_files, sample_base_analysis, personas=None
            )

            # Should use LLM detection
            mock_llm_detect.assert_called_once()
            assert len(result) == 1
            assert isinstance(result[0], DetectedStakeholder)
            assert result[0].stakeholder_id == "llm_stakeholder_1"
            assert result[0].individual_insights.get("name") == "LLM Detected User"

    @pytest.mark.asyncio
    async def test_detect_stakeholders_with_pattern_fallback(
        self, stakeholder_detector, sample_base_analysis, sample_files
    ):
        """Test stakeholder detection with pattern-based fallback."""

        # Mock LLM detection to return empty
        with patch.object(
            stakeholder_detector, "_detect_with_llm", new_callable=AsyncMock
        ) as mock_llm_detect:
            mock_llm_detect.return_value = []

            # Mock legacy detector
            mock_pattern_result = Mock()
            mock_pattern_result.detected_stakeholders = [
                {
                    "id": "pattern_stakeholder_1",
                    "type": "primary_customer",
                    "confidence": 0.7,
                    "individual_insights": {
                        "name": "Pattern Detected Customer",
                        "role": "Customer",
                        "key_concerns": ["Product quality"],
                        "source": "pattern_detection",
                    },
                }
            ]

            with patch.object(
                stakeholder_detector.legacy_detector, "detect_multi_stakeholder_data"
            ) as mock_pattern:
                mock_pattern.return_value = mock_pattern_result

                result = await stakeholder_detector.detect_stakeholders(
                    sample_files, sample_base_analysis, personas=None
                )

                # Should use pattern detection
                mock_pattern.assert_called_once()
                assert len(result) == 1
                assert (
                    result[0].individual_insights.get("source") == "pattern_detection"
                )

    def test_extract_stakeholder_type(self, stakeholder_detector):
        """Test stakeholder type extraction from persona data."""

        # Test with stakeholder intelligence
        persona1 = {"stakeholder_intelligence": {"stakeholder_type": "Product Manager"}}
        assert (
            stakeholder_detector._extract_stakeholder_type(persona1)
            == "Product Manager"
        )

        # Test with role fallback
        persona2 = {"role": "Developer"}
        assert stakeholder_detector._extract_stakeholder_type(persona2) == "Developer"

        # Test with demographics fallback
        persona3 = {"demographics": {"role": "Designer"}}
        assert stakeholder_detector._extract_stakeholder_type(persona3) == "Designer"

        # Test with string demographics
        persona4 = {"demographics": "Senior Analyst"}
        assert (
            stakeholder_detector._extract_stakeholder_type(persona4) == "Senior Analyst"
        )

        # Test with no data
        persona5 = {}
        assert (
            stakeholder_detector._extract_stakeholder_type(persona5)
            == "Unknown Stakeholder"
        )

    def test_calculate_influence_level(self, stakeholder_detector):
        """Test influence level calculation."""

        # Test with leadership role
        persona1 = {
            "role": "Product Manager",
            "goals_and_motivations": {"evidence": ["quote1", "quote2", "quote3"]},
            "challenges_and_frustrations": {"evidence": ["quote4", "quote5"]},
            "key_quotes": {"evidence": ["quote6"]},
        }
        influence1 = stakeholder_detector._calculate_influence_level(persona1)
        assert influence1 > 0.5  # Should be boosted for manager role

        # Test with high evidence count
        persona2 = {
            "role": "Developer",
            "goals_and_motivations": {"evidence": ["q1", "q2", "q3"]},
            "challenges_and_frustrations": {"evidence": ["q4", "q5", "q6"]},
        }
        influence2 = stakeholder_detector._calculate_influence_level(persona2)
        assert influence2 > 0.5  # Should be boosted for high evidence

        # Test with minimal data
        persona3 = {"role": "User"}
        influence3 = stakeholder_detector._calculate_influence_level(persona3)
        assert 0.0 <= influence3 <= 1.0

    def test_extract_key_concerns(self, stakeholder_detector):
        """Test key concerns extraction."""

        persona = {
            "challenges_and_frustrations": {"value": "Technical debt is a major issue"},
            "goals_and_motivations": {"value": "Improve system performance"},
        }

        concerns = stakeholder_detector._extract_key_concerns(persona)
        assert len(concerns) == 2
        assert "Technical debt is a major issue" in concerns
        assert "Goal: Improve system performance" in concerns

    def test_deduplicate_stakeholders(self, stakeholder_detector):
        """Test stakeholder deduplication."""

        stakeholders = [
            DetectedStakeholder(
                stakeholder_id="1",
                stakeholder_type="decision_maker",
                confidence_score=0.9,
                individual_insights={"name": "John Doe", "role": "PM"},
            ),
            DetectedStakeholder(
                stakeholder_id="2",
                stakeholder_type="decision_maker",
                confidence_score=0.8,
                individual_insights={"name": "john doe", "role": "Product Manager"},
            ),
            DetectedStakeholder(
                stakeholder_id="3",
                stakeholder_type="secondary_user",
                confidence_score=0.85,
                individual_insights={"name": "Jane Smith", "role": "Dev"},
            ),
        ]

        unique = stakeholder_detector._deduplicate_stakeholders(stakeholders)

        # Should remove the duplicate John Doe
        assert len(unique) == 2
        names = [s.individual_insights.get("name") for s in unique]
        assert "John Doe" in names
        assert "Jane Smith" in names

    def test_validate_stakeholders(self, stakeholder_detector):
        """Test stakeholder validation."""

        stakeholders = [
            DetectedStakeholder(
                stakeholder_id="1",
                stakeholder_type="decision_maker",
                confidence_score=0.9,
                individual_insights={"name": "Valid Stakeholder", "role": "PM"},
            ),
            DetectedStakeholder(
                stakeholder_id="",  # Invalid: empty id to fail
                stakeholder_type="secondary_user",
                confidence_score=0.8,
                individual_insights={"name": "", "role": "Dev"},
            ),
            DetectedStakeholder(
                stakeholder_id="3",
                stakeholder_type="primary_customer",
                confidence_score=0.2,  # Invalid: too low confidence
                individual_insights={"name": "Low Confidence", "role": "End User"},
            ),
        ]

        valid = stakeholder_detector._validate_stakeholders(stakeholders)

        # Should keep only the valid stakeholder
        assert len(valid) == 1
        assert valid[0].individual_insights.get("name") == "Valid Stakeholder"

    def test_extract_content_from_files(self, stakeholder_detector):
        """Test content extraction from various file types."""

        # Test with string files
        files1 = ["Content 1", "Content 2"]
        content1 = stakeholder_detector._extract_content_from_files(files1)
        assert content1 == "Content 1\n\nContent 2"

        # Test with dict files
        files2 = [{"content": "Dict content 1"}, {"content": "Dict content 2"}]
        content2 = stakeholder_detector._extract_content_from_files(files2)
        assert "Dict content 1" in content2
        assert "Dict content 2" in content2

        # Test with mock file objects
        mock_file = Mock()
        mock_file.read.return_value = b"Binary content"
        files3 = [mock_file]
        content3 = stakeholder_detector._extract_content_from_files(files3)
        assert content3 == "Binary content"
