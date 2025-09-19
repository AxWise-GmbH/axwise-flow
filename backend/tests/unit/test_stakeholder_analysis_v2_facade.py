"""
Unit tests for StakeholderAnalysisV2 Facade

Tests the modular facade orchestration and backward compatibility.
"""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from typing import List, Dict, Any

from backend.services.stakeholder_analysis_v2.facade import StakeholderAnalysisFacade
from backend.schemas import (
    DetailedAnalysisResult,
    DetectedStakeholder,
    CrossStakeholderPatterns,
    MultiStakeholderSummary,
    StakeholderIntelligence,
)


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
def stakeholder_facade(mock_llm_service):
    """Fixture for StakeholderAnalysisFacade."""
    return StakeholderAnalysisFacade(mock_llm_service)


@pytest.fixture
def sample_base_analysis():
    """Fixture for sample base analysis."""
    return DetailedAnalysisResult(
        id="result_test_1",
        status="completed",
        createdAt="2025-01-01T00:00:00Z",
        fileName="sample.txt",
        fileSize=123,
        themes=[{"name": "Sample Theme", "definition": "Sample description"}],
        patterns=[],
        insights=[],
    )


@pytest.fixture
def sample_detected_stakeholders():
    """Fixture for sample detected stakeholders."""
    return [
        DetectedStakeholder(
            stakeholder_id="stakeholder_1",
            stakeholder_type="decision_maker",
            confidence_score=0.9,
            individual_insights={
                "name": "John Doe",
                "role": "Senior PM",
                "key_concerns": ["User experience", "Product roadmap"],
                "source": "test",
            },
        ),
        DetectedStakeholder(
            stakeholder_id="stakeholder_2",
            stakeholder_type="secondary_user",
            confidence_score=0.85,
            individual_insights={
                "name": "Jane Smith",
                "role": "Senior Developer",
                "key_concerns": ["Technical debt", "Performance"],
                "source": "test",
            },
        ),
    ]


@pytest.fixture
def sample_files():
    """Fixture for sample files."""
    return ["Sample interview content about product development"]


class TestStakeholderAnalysisFacade:
    """Test cases for StakeholderAnalysisFacade."""

    def test_facade_initialization(self, mock_llm_service):
        """Test that facade initializes correctly with all components."""
        facade = StakeholderAnalysisFacade(mock_llm_service)

        # Check that all components are initialized
        assert facade.llm_service == mock_llm_service
        assert facade.detector is not None
        assert facade.theme_analyzer is not None
        assert facade.evidence_aggregator is not None
        assert facade.influence_calculator is not None
        assert facade.report_assembler is not None
        assert facade.validator is not None

    @pytest.mark.asyncio
    async def test_enhance_analysis_success(
        self, stakeholder_facade, sample_base_analysis, sample_files
    ):
        """Test successful analysis enhancement."""

        # Mock all component methods
        with patch.object(
            stakeholder_facade.detector, "detect_stakeholders", new_callable=AsyncMock
        ) as mock_detect, patch.object(
            stakeholder_facade.influence_calculator,
            "analyze_patterns",
            new_callable=AsyncMock,
        ) as mock_patterns, patch.object(
            stakeholder_facade.report_assembler,
            "generate_summary",
            new_callable=AsyncMock,
        ) as mock_summary, patch.object(
            stakeholder_facade.theme_analyzer,
            "enhance_themes_with_attribution",
            new_callable=AsyncMock,
        ) as mock_themes, patch.object(
            stakeholder_facade.evidence_aggregator,
            "aggregate_evidence",
            new_callable=AsyncMock,
        ) as mock_evidence, patch.object(
            stakeholder_facade.report_assembler, "assemble_final_result"
        ) as mock_assemble, patch.object(
            stakeholder_facade.validator, "validate_analysis_result"
        ) as mock_validate:

            # Setup mock returns with schema-compliant objects
            from backend.schemas import (
                DetectedStakeholder,
                CrossStakeholderPatterns,
                MultiStakeholderSummary,
            )

            mock_stakeholders = [
                DetectedStakeholder(
                    stakeholder_id="s1",
                    stakeholder_type="decision_maker",
                    confidence_score=0.9,
                    name="Alice",
                    role="Head of Product",
                    influence_level=0.8,
                    key_concerns=["Time to market"],
                )
            ]
            mock_detect.return_value = mock_stakeholders
            mock_patterns.return_value = CrossStakeholderPatterns(
                consensus_areas=[], conflict_zones=[], influence_networks=[]
            )
            mock_summary.return_value = MultiStakeholderSummary(
                total_stakeholders=len(mock_stakeholders),
                consensus_score=0.5,
                conflict_score=0.2,
                key_insights=[],
                implementation_recommendations=[],
            )
            mock_themes.return_value = []
            mock_evidence.return_value = {}
            mock_assemble.return_value = sample_base_analysis
            mock_validate.return_value = sample_base_analysis

            # Run the analysis
            result = (
                await stakeholder_facade.enhance_analysis_with_stakeholder_intelligence(
                    sample_base_analysis, sample_files
                )
            )

            # Verify all components were called
            mock_detect.assert_called_once()
            mock_patterns.assert_called_once_with(mock_stakeholders, sample_files)
            mock_summary.assert_called_once()
            mock_themes.assert_called_once()
            mock_evidence.assert_called_once_with(mock_stakeholders, sample_files)
            mock_assemble.assert_called_once()
            mock_validate.assert_called_once()

            # Verify result
            assert result == sample_base_analysis

    @pytest.mark.asyncio
    async def test_enhance_analysis_with_personas(
        self, stakeholder_facade, sample_base_analysis, sample_files
    ):
        """Test analysis enhancement with personas provided."""

        personas = [{"name": "Test Persona", "role": "Test Role"}]

        with patch.object(
            stakeholder_facade.detector, "detect_stakeholders", new_callable=AsyncMock
        ) as mock_detect:
            mock_detect.return_value = []

            # Mock other components to avoid full execution
            with patch.object(
                stakeholder_facade.influence_calculator,
                "analyze_patterns",
                new_callable=AsyncMock,
            ), patch.object(
                stakeholder_facade.report_assembler,
                "generate_summary",
                new_callable=AsyncMock,
            ), patch.object(
                stakeholder_facade.theme_analyzer,
                "enhance_themes_with_attribution",
                new_callable=AsyncMock,
            ), patch.object(
                stakeholder_facade.evidence_aggregator,
                "aggregate_evidence",
                new_callable=AsyncMock,
            ), patch.object(
                stakeholder_facade.report_assembler, "assemble_final_result"
            ) as mock_assemble, patch.object(
                stakeholder_facade.validator, "validate_analysis_result"
            ) as mock_validate:

                mock_assemble.return_value = sample_base_analysis
                mock_validate.return_value = sample_base_analysis

                await stakeholder_facade.enhance_analysis_with_stakeholder_intelligence(
                    sample_base_analysis, sample_files, personas=personas
                )

                # Verify personas were passed to detector
                mock_detect.assert_called_once_with(
                    sample_files, sample_base_analysis, personas
                )

    @pytest.mark.asyncio
    async def test_enhance_analysis_failure_fallback(
        self, stakeholder_facade, sample_base_analysis, sample_files
    ):
        """Test that analysis falls back to original on failure."""

        # Mock detector to raise exception
        with patch.object(
            stakeholder_facade.detector, "detect_stakeholders", new_callable=AsyncMock
        ) as mock_detect:
            mock_detect.side_effect = Exception("Test error")

            result = (
                await stakeholder_facade.enhance_analysis_with_stakeholder_intelligence(
                    sample_base_analysis, sample_files
                )
            )

            # Should return original analysis on failure
            assert result == sample_base_analysis

    def test_use_v2_feature_flag(self, stakeholder_facade):
        """Test V2 feature flag detection."""

        # Test default (should be False)
        with patch.dict("os.environ", {}, clear=True):
            assert not stakeholder_facade._use_v2()

        # Test enabled values
        enabled_values = ["1", "true", "yes", "on", "TRUE", "YES", "ON"]
        for value in enabled_values:
            with patch.dict("os.environ", {"STAKEHOLDER_ANALYSIS_V2": value}):
                assert stakeholder_facade._use_v2()

        # Test disabled values
        disabled_values = ["0", "false", "no", "off", "FALSE", "NO", "OFF"]
        for value in disabled_values:
            with patch.dict("os.environ", {"STAKEHOLDER_ANALYSIS_V2": value}):
                assert not stakeholder_facade._use_v2()

    @pytest.mark.asyncio
    async def test_component_integration(self, stakeholder_facade, sample_files):
        """Test that components are properly integrated and can communicate."""

        # Create a minimal base analysis
        base_analysis = DetailedAnalysisResult(
            id="test",
            status="completed",
            createdAt="2024-01-01T00:00:00Z",
            fileName="sample.txt",
            themes=[],
            patterns=[],
            insights=[],
            metadata={},
        )

        # Patch components returning schema-compliant minimal outputs
        from backend.schemas import CrossStakeholderPatterns, MultiStakeholderSummary

        with patch.object(
            stakeholder_facade.influence_calculator,
            "analyze_patterns",
            new_callable=AsyncMock,
        ) as mock_patterns, patch.object(
            stakeholder_facade.report_assembler,
            "generate_summary",
            new_callable=AsyncMock,
        ) as mock_summary:
            mock_patterns.return_value = CrossStakeholderPatterns()
            mock_summary.return_value = MultiStakeholderSummary(
                total_stakeholders=0, consensus_score=0.0, conflict_score=0.0
            )

            # This test verifies that the facade can orchestrate components without errors
            # Even if the components return minimal/empty results
            try:
                result = await stakeholder_facade.enhance_analysis_with_stakeholder_intelligence(
                    base_analysis, sample_files
                )
                # Should not raise an exception and should return some result
                assert result is not None
            except Exception as e:
                # If there are import or initialization issues, they should be handled gracefully
                pytest.fail(f"Component integration failed: {e}")

    def test_facade_component_types(self, stakeholder_facade):
        """Test that facade components are of the correct types."""

        from backend.services.stakeholder_analysis_v2.detector import (
            StakeholderDetector,
        )
        from backend.services.stakeholder_analysis_v2.theme_analyzer import (
            StakeholderThemeAnalyzer,
        )
        from backend.services.stakeholder_analysis_v2.evidence_aggregator import (
            EvidenceAggregator,
        )
        from backend.services.stakeholder_analysis_v2.influence_calculator import (
            InfluenceMetricsCalculator,
        )
        from backend.services.stakeholder_analysis_v2.report_assembler import (
            StakeholderReportAssembler,
        )
        from backend.services.stakeholder_analysis_v2.validation import (
            StakeholderAnalysisValidation,
        )

        assert isinstance(stakeholder_facade.detector, StakeholderDetector)
        assert isinstance(stakeholder_facade.theme_analyzer, StakeholderThemeAnalyzer)
        assert isinstance(stakeholder_facade.evidence_aggregator, EvidenceAggregator)
        assert isinstance(
            stakeholder_facade.influence_calculator, InfluenceMetricsCalculator
        )
        assert isinstance(
            stakeholder_facade.report_assembler, StakeholderReportAssembler
        )
        assert isinstance(stakeholder_facade.validator, StakeholderAnalysisValidation)
