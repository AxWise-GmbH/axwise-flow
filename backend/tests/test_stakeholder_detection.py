"""
Tests for multi-stakeholder detection logic
"""

import pytest
from unittest.mock import Mock, patch
from backend.models.stakeholder_models import (
    StakeholderDetector,
    StakeholderDetectionResult,
)


class TestStakeholderDetector:
    """Test cases for StakeholderDetector class"""

    def test_single_file_no_stakeholders(self):
        """Test detection with single file containing no stakeholder indicators"""
        content = "This is a simple text with no stakeholder information."
        mock_file = Mock()
        mock_file.read.return_value = content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])

        assert not result.is_multi_stakeholder
        assert len(result.detected_stakeholders) == 0
        assert result.confidence_score < 0.3
        assert result.detection_method == "single_file_analysis"

    def test_single_file_with_interview_sections(self):
        """Test detection with single file containing multiple interview sections"""
        content = """
        INTERVIEW 1
        Name: John Smith
        Age: 35
        Role: Product Manager

        Q: What are your main concerns?
        A: I need better analytics tools.

        INTERVIEW 2
        Name: Sarah Johnson
        Age: 28
        Role: End User

        Q: How do you use the product?
        A: I use it daily for reporting.
        """
        mock_file = Mock()
        mock_file.read.return_value = content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])

        assert result.is_multi_stakeholder
        assert len(result.detected_stakeholders) == 2
        assert result.confidence_score > 0.3
        assert result.detection_method == "single_file_analysis"

        # Check stakeholder details
        stakeholder_ids = [s["stakeholder_id"] for s in result.detected_stakeholders]
        assert "John Smith" in stakeholder_ids
        assert "Sarah Johnson" in stakeholder_ids

    def test_single_file_with_persona_markers(self):
        """Test detection with persona markers"""
        content = """
        Persona: Primary Customer - Tech Enthusiast
        Age: 30, Role: Software Developer

        Persona: Decision Maker - IT Director
        Age: 45, Role: IT Director

        Stakeholder: Secondary User
        Role: Support Staff
        """
        mock_file = Mock()
        mock_file.read.return_value = content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])

        assert result.is_multi_stakeholder
        assert len(result.detected_stakeholders) >= 2
        assert result.confidence_score > 0.3

    def test_multi_file_stakeholder_detection(self):
        """Test detection across multiple files"""
        file1_content = """
        INTERVIEW 1
        Name: Alice Cooper
        Age: 32
        Role: Product Owner
        """

        file2_content = """
        INTERVIEW 2
        Name: Bob Wilson
        Age: 28
        Role: End User
        """

        mock_file1 = Mock()
        mock_file1.read.return_value = file1_content
        mock_file2 = Mock()
        mock_file2.read.return_value = file2_content

        result = StakeholderDetector.detect_multi_stakeholder_data(
            [mock_file1, mock_file2]
        )

        assert result.is_multi_stakeholder
        assert len(result.detected_stakeholders) == 2
        assert result.detection_method == "multi_file_analysis"

        # Check file source tracking
        stakeholder_ids = [s["stakeholder_id"] for s in result.detected_stakeholders]
        assert any("File1_" in sid for sid in stakeholder_ids)
        assert any("File2_" in sid for sid in stakeholder_ids)

    def test_stakeholder_type_classification(self):
        """Test stakeholder type classification logic"""
        # Test decision maker classification
        decision_maker_content = (
            "Role: CEO, I make budget decisions and approve projects"
        )
        stakeholder_type = StakeholderDetector._classify_stakeholder_type(
            decision_maker_content
        )
        assert stakeholder_type == "decision_maker"

        # Test influencer classification
        influencer_content = (
            "Role: Industry Expert, I advise companies on best practices"
        )
        stakeholder_type = StakeholderDetector._classify_stakeholder_type(
            influencer_content
        )
        assert stakeholder_type == "influencer"

        # Test secondary user classification
        secondary_content = (
            "Role: System Administrator, I maintain the technical infrastructure"
        )
        stakeholder_type = StakeholderDetector._classify_stakeholder_type(
            secondary_content
        )
        assert stakeholder_type == "secondary_user"

        # Test default classification
        default_content = "I am a regular user of the product"
        stakeholder_type = StakeholderDetector._classify_stakeholder_type(
            default_content
        )
        assert stakeholder_type == "primary_customer"

    def test_extract_stakeholders_from_content(self):
        """Test stakeholder extraction from content"""
        content = """
        INTERVIEW 1
        Name: Test User 1
        Age: 30
        Role: Manager

        INTERVIEW 2
        Name: Test User 2
        Age: 25
        Role: Developer
        """

        stakeholders = StakeholderDetector._extract_stakeholders_from_content(content)

        assert len(stakeholders) == 2
        assert stakeholders[0]["stakeholder_id"] == "Test User 1"
        assert stakeholders[1]["stakeholder_id"] == "Test User 2"
        assert stakeholders[0]["demographic_info"]["age"] == 30
        assert stakeholders[1]["demographic_info"]["role"] == "Developer"

    def test_detect_personas_in_content(self):
        """Test persona detection when no clear interview sections exist"""
        content = """
        Persona 1: Tech-Savvy Manager
        Participant: Sarah from Marketing
        Interviewee: John the Developer
        """

        stakeholders = StakeholderDetector._detect_personas_in_content(content)

        assert len(stakeholders) == 3
        stakeholder_ids = [s["stakeholder_id"] for s in stakeholders]
        assert "Tech-Savvy Manager" in stakeholder_ids
        assert "Sarah from Marketing" in stakeholder_ids
        assert "John the Developer" in stakeholder_ids

    def test_file_content_extraction(self):
        """Test file content extraction from different file types"""
        # Test with file-like object
        mock_file = Mock()
        mock_file.read.return_value = b"Test content"
        content = StakeholderDetector._extract_file_content(mock_file)
        assert content == "Test content"

        # Test with string
        content = StakeholderDetector._extract_file_content("Direct string content")
        assert content == "Direct string content"

        # Test with other object
        content = StakeholderDetector._extract_file_content(123)
        assert content == "123"

    def test_confidence_scoring(self):
        """Test confidence score calculation"""
        # High confidence content
        high_confidence_content = """
        INTERVIEW 1
        Persona: Primary Customer
        Stakeholder: Decision Maker
        Age: 30, Role: Manager

        INTERVIEW 2
        Persona: Secondary User
        Age: 25, Role: Developer
        """
        mock_file = Mock()
        mock_file.read.return_value = high_confidence_content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])
        assert result.confidence_score > 0.5

        # Low confidence content
        low_confidence_content = "Some text with minimal stakeholder indicators"
        mock_file.read.return_value = low_confidence_content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])
        assert result.confidence_score < 0.3

    def test_error_handling(self):
        """Test error handling in stakeholder detection"""
        # Test with file that raises exception
        mock_file = Mock()
        mock_file.read.side_effect = Exception("File read error")

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])

        assert not result.is_multi_stakeholder
        assert result.detection_method == "error"
        assert "error" in result.metadata

    def test_empty_file_list(self):
        """Test detection with empty file list"""
        result = StakeholderDetector.detect_multi_stakeholder_data([])

        assert not result.is_multi_stakeholder
        assert len(result.detected_stakeholders) == 0
        assert result.detection_method == "no_files"

    def test_stakeholder_limit(self):
        """Test that stakeholder detection respects limits"""
        # Create content with many personas
        content = "\n".join([f"Persona {i}: Test User {i}" for i in range(10)])

        stakeholders = StakeholderDetector._detect_personas_in_content(content)

        # Should be limited to 5 stakeholders max
        assert len(stakeholders) <= 5

    def test_metadata_collection(self):
        """Test that metadata is properly collected"""
        content = """
        INTERVIEW 1
        Persona: Test User
        Stakeholder: Manager
        """
        mock_file = Mock()
        mock_file.read.return_value = content

        result = StakeholderDetector.detect_multi_stakeholder_data([mock_file])

        assert "pattern_matches" in result.metadata
        assert "keyword_matches" in result.metadata
        assert "content_length" in result.metadata
        assert result.metadata["content_length"] == len(content)

    def test_multi_file_metadata(self):
        """Test metadata collection for multi-file analysis"""
        mock_file1 = Mock()
        mock_file1.read.return_value = "INTERVIEW 1\nPersona: User 1"
        mock_file2 = Mock()
        mock_file2.read.return_value = "INTERVIEW 2\nPersona: User 2"

        result = StakeholderDetector.detect_multi_stakeholder_data(
            [mock_file1, mock_file2]
        )

        assert result.metadata["total_files"] == 2
        assert "stakeholders_per_file" in result.metadata
        assert len(result.metadata["stakeholders_per_file"]) == 2


class TestStakeholderDetectionResult:
    """Test cases for StakeholderDetectionResult dataclass"""

    def test_detection_result_creation(self):
        """Test creation of StakeholderDetectionResult"""
        result = StakeholderDetectionResult(
            is_multi_stakeholder=True,
            detected_stakeholders=[{"id": "test"}],
            confidence_score=0.8,
            detection_method="test_method",
            metadata={"test": "data"},
        )

        assert result.is_multi_stakeholder
        assert len(result.detected_stakeholders) == 1
        assert result.confidence_score == 0.8
        assert result.detection_method == "test_method"
        assert result.metadata["test"] == "data"


if __name__ == "__main__":
    pytest.main([__file__])


# Additional integration tests for stakeholder analysis service
class TestStakeholderAnalysisServiceIntegration:
    """Integration tests for StakeholderAnalysisService"""

    @pytest.mark.asyncio
    async def test_enhance_analysis_with_single_stakeholder(self):
        """Test enhancement with single stakeholder data (should skip enhancement)"""
        from backend.services.stakeholder_analysis_service import (
            StakeholderAnalysisService,
        )
        from backend.schemas import DetailedAnalysisResult

        # Create mock single-stakeholder analysis
        base_analysis = DetailedAnalysisResult(
            id="test-123",
            status="completed",
            createdAt="2024-01-01T00:00:00Z",
            fileName="single_interview.txt",
            themes=[],
            patterns=[],
            sentimentOverview={"positive": 0.5, "neutral": 0.3, "negative": 0.2},
            sentiment=[],
        )

        # Create mock file with single stakeholder content
        mock_file = Mock()
        mock_file.read.return_value = (
            "Single user interview content without multiple stakeholders"
        )

        service = StakeholderAnalysisService()
        result = await service.enhance_analysis_with_stakeholder_intelligence(
            [mock_file], base_analysis
        )

        # Should return original analysis without stakeholder intelligence
        assert result.stakeholder_intelligence is None
        assert result.id == base_analysis.id

    @pytest.mark.asyncio
    async def test_enhance_analysis_with_multi_stakeholder(self):
        """Test enhancement with multi-stakeholder data"""
        from backend.services.stakeholder_analysis_service import (
            StakeholderAnalysisService,
        )
        from backend.schemas import DetailedAnalysisResult

        # Create mock multi-stakeholder analysis
        base_analysis = DetailedAnalysisResult(
            id="test-456",
            status="completed",
            createdAt="2024-01-01T00:00:00Z",
            fileName="multi_interview.txt",
            themes=[],
            patterns=[],
            sentimentOverview={"positive": 0.5, "neutral": 0.3, "negative": 0.2},
            sentiment=[],
        )

        # Create mock file with multi-stakeholder content
        mock_file = Mock()
        mock_file.read.return_value = """
        INTERVIEW 1
        Name: Manager User
        Age: 40
        Role: Product Manager

        INTERVIEW 2
        Name: End User
        Age: 25
        Role: Customer
        """

        service = StakeholderAnalysisService()
        result = await service.enhance_analysis_with_stakeholder_intelligence(
            [mock_file], base_analysis
        )

        # Should have stakeholder intelligence
        assert result.stakeholder_intelligence is not None
        assert len(result.stakeholder_intelligence.detected_stakeholders) >= 2
        assert result.stakeholder_intelligence.processing_metadata is not None

    @pytest.mark.asyncio
    async def test_error_handling_in_enhancement(self):
        """Test error handling during stakeholder enhancement"""
        from backend.services.stakeholder_analysis_service import (
            StakeholderAnalysisService,
        )
        from backend.schemas import DetailedAnalysisResult

        base_analysis = DetailedAnalysisResult(
            id="test-error",
            status="completed",
            createdAt="2024-01-01T00:00:00Z",
            fileName="error_test.txt",
            themes=[],
            patterns=[],
            sentimentOverview={"positive": 0.5, "neutral": 0.3, "negative": 0.2},
            sentiment=[],
        )

        # Create mock file that will cause an error
        mock_file = Mock()
        mock_file.read.side_effect = Exception("File processing error")

        service = StakeholderAnalysisService()
        result = await service.enhance_analysis_with_stakeholder_intelligence(
            [mock_file], base_analysis
        )

        # Should handle error gracefully
        assert result.stakeholder_intelligence is not None
        assert (
            result.stakeholder_intelligence.processing_metadata.get(
                "enhancement_failed"
            )
            is True
        )
        assert "error" in result.stakeholder_intelligence.processing_metadata
