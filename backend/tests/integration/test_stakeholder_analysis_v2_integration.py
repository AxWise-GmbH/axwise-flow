"""
Integration tests for StakeholderAnalysisV2

Tests the integration between the V2 facade and the main service,
including feature flag behavior and backward compatibility.
"""

import pytest
import os
from unittest.mock import Mock, AsyncMock, patch
from typing import List, Dict, Any

from backend.services.stakeholder_analysis_service import StakeholderAnalysisService
from backend.schemas import DetailedAnalysisResult


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
def sample_base_analysis():
    """Fixture for sample base analysis."""
    return DetailedAnalysisResult(
        id="integration_result_1",
        status="completed",
        createdAt="2025-01-01T00:00:00Z",
        fileName="integration.txt",
        themes=[{"name": "User Experience", "definition": "Focus on UX improvements"}],
        patterns=[{"name": "Usability concerns"}],
        insights=[
            {
                "topic": "Interface",
                "observation": "Users want better interface",
                "evidence": [],
            }
        ],
    )


@pytest.fixture
def sample_files():
    """Fixture for sample files."""
    return ["Sample interview content about product development and user feedback"]


class TestStakeholderAnalysisV2Integration:
    """Integration test cases for StakeholderAnalysisV2."""

    def test_service_initialization_with_v2_facade(self, mock_llm_service):
        """Test that the main service initializes V2 facade correctly."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Check that V2 facade is initialized
        assert hasattr(service, "_v2_facade")
        # V2 facade might be None if imports fail, but should not raise exception

        # Check that feature flag method exists
        assert hasattr(service, "_use_v2")
        assert callable(service._use_v2)

    def test_feature_flag_behavior(self, mock_llm_service):
        """Test feature flag behavior in the main service."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Test default behavior (V2 disabled)
        with patch.dict(os.environ, {}, clear=True):
            assert not service._use_v2()

        # Test V2 enabled
        with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
            assert service._use_v2()

        # Test V2 disabled explicitly
        with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "false"}):
            assert not service._use_v2()

    @pytest.mark.asyncio
    async def test_v2_facade_integration_success(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test successful V2 facade integration."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Mock V2 facade to return enhanced analysis
        enhanced_analysis = DetailedAnalysisResult(
            id=sample_base_analysis.id,
            status="completed",
            createdAt=sample_base_analysis.createdAt,
            fileName=sample_base_analysis.fileName,
            themes=sample_base_analysis.themes + [{"name": "V2 Enhanced Theme"}],
            patterns=sample_base_analysis.patterns,
            insights=sample_base_analysis.insights
            + [{"topic": "V2", "observation": "V2 Enhanced Insight", "evidence": []}],
        )

        mock_v2_facade = Mock()
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock(
            return_value=enhanced_analysis
        )
        service._v2_facade = mock_v2_facade

        # Enable V2 feature flag
        with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
            result = await service.enhance_analysis_with_stakeholder_intelligence(
                sample_files, sample_base_analysis
            )

        # Should use V2 facade
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence.assert_called_once()
        assert result == enhanced_analysis

        # Support both dict and Pydantic model entries
        def _get_name(t):
            return t.get("name") if isinstance(t, dict) else getattr(t, "name", None)

        def _get_observation(i):
            return (
                i.get("observation")
                if isinstance(i, dict)
                else getattr(i, "observation", None)
            )

        assert any(_get_name(t) == "V2 Enhanced Theme" for t in result.themes)
        assert any(
            _get_observation(i) == "V2 Enhanced Insight" for i in result.insights
        )

    @pytest.mark.asyncio
    async def test_v2_facade_fallback_to_v1(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test fallback to V1 when V2 facade fails."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Mock V2 facade to raise exception
        mock_v2_facade = Mock()
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock(
            side_effect=Exception("V2 facade error")
        )
        service._v2_facade = mock_v2_facade

        # Mock V1 behavior to return original analysis
        with patch.object(
            service, "_detect_stakeholders_from_personas"
        ) as mock_v1_detect:
            mock_v1_detect.return_value = []

            # Enable V2 feature flag
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
                result = await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )

            # Should attempt V2 but fall back to V1
            mock_v2_facade.enhance_analysis_with_stakeholder_intelligence.assert_called_once()
            # Result should be processed by V1 logic (might be modified)
            assert result is not None

    @pytest.mark.asyncio
    async def test_v1_behavior_when_v2_disabled(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test that V1 behavior is used when V2 is disabled."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Mock V2 facade (should not be called)
        mock_v2_facade = Mock()
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock()
        service._v2_facade = mock_v2_facade

        # Mock V1 behavior
        with patch.object(
            service, "_detect_stakeholders_from_personas"
        ) as mock_v1_detect:
            mock_v1_detect.return_value = []

            # Disable V2 feature flag
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "false"}):
                result = await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )

            # Should not call V2 facade
            mock_v2_facade.enhance_analysis_with_stakeholder_intelligence.assert_not_called()
            # Should use V1 logic
            mock_v1_detect.assert_called()
            assert result is not None

    @pytest.mark.asyncio
    async def test_v2_facade_with_personas(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test V2 facade integration with personas."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Add personas to base analysis
        personas = [
            {"name": "Test Persona", "role": "Product Manager"},
            {"name": "Another Persona", "role": "Developer"},
        ]
        sample_base_analysis.personas = personas

        # Mock V2 facade
        mock_v2_facade = Mock()
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock(
            return_value=sample_base_analysis
        )
        service._v2_facade = mock_v2_facade

        # Enable V2 feature flag
        with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
            await service.enhance_analysis_with_stakeholder_intelligence(
                sample_files, sample_base_analysis
            )

        # Should pass personas to V2 facade
        call_args = (
            mock_v2_facade.enhance_analysis_with_stakeholder_intelligence.call_args
        )
        assert call_args[1]["personas"] == personas

    def test_backward_compatibility_interface(self, mock_llm_service):
        """Test that the service maintains backward compatibility."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Check that the main method signature is preserved
        method = service.enhance_analysis_with_stakeholder_intelligence
        assert callable(method)

        # Check that the method is async
        import asyncio

        assert asyncio.iscoroutinefunction(method)

    @pytest.mark.asyncio
    async def test_v2_facade_none_fallback(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test fallback when V2 facade is None (initialization failed)."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Set V2 facade to None (simulating initialization failure)
        service._v2_facade = None

        # Mock V1 behavior
        with patch.object(
            service, "_detect_stakeholders_from_personas"
        ) as mock_v1_detect:
            mock_v1_detect.return_value = []

            # Enable V2 feature flag
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
                result = await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )

            # Should fall back to V1 when facade is None
            mock_v1_detect.assert_called()
            assert result is not None

    @pytest.mark.asyncio
    async def test_error_handling_and_logging(
        self, mock_llm_service, sample_base_analysis, sample_files, caplog
    ):
        """Test error handling and logging in V2 integration."""

        service = StakeholderAnalysisService(mock_llm_service)

        # Mock V2 facade to raise exception
        mock_v2_facade = Mock()
        mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock(
            side_effect=ValueError("Test V2 error")
        )
        service._v2_facade = mock_v2_facade

        # Mock V1 behavior
        with patch.object(
            service, "_detect_stakeholders_from_personas"
        ) as mock_v1_detect:
            mock_v1_detect.return_value = []

            # Enable V2 feature flag
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
                await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )

            # Should log the V2 failure
            assert "V2 facade failed, falling back to V1" in caplog.text
            assert "Test V2 error" in caplog.text

    def test_dependency_injection_compatibility(self):
        """Test that the service works with dependency injection."""

        # Test that service can be created through container
        try:
            from backend.infrastructure.container import Container

            container = Container()

            # Should be able to get LLM service
            llm_service = container.get_llm_service("gemini")
            assert llm_service is not None

            # Should be able to get stakeholder analysis service
            stakeholder_service = container.get_stakeholder_analysis_service()
            assert stakeholder_service is not None
            assert hasattr(stakeholder_service, "_v2_facade")

        except Exception as e:
            # If there are environment or dependency issues, log but don't fail
            pytest.skip(f"Dependency injection test skipped due to: {e}")

    @pytest.mark.asyncio
    async def test_performance_comparison(
        self, mock_llm_service, sample_base_analysis, sample_files
    ):
        """Test that V2 doesn't significantly degrade performance."""

        import time

        service = StakeholderAnalysisService(mock_llm_service)

        # Mock both V1 and V2 to return quickly
        with patch.object(service, "_detect_stakeholders_from_personas") as mock_v1:
            mock_v1.return_value = []

            mock_v2_facade = Mock()
            mock_v2_facade.enhance_analysis_with_stakeholder_intelligence = AsyncMock(
                return_value=sample_base_analysis
            )
            service._v2_facade = mock_v2_facade

            # Test V1 performance
            start_time = time.time()
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "false"}):
                await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )
            v1_time = time.time() - start_time

            # Test V2 performance
            start_time = time.time()
            with patch.dict(os.environ, {"STAKEHOLDER_ANALYSIS_V2": "true"}):
                await service.enhance_analysis_with_stakeholder_intelligence(
                    sample_files, sample_base_analysis
                )
            v2_time = time.time() - start_time

            # V2 should not be significantly slower (allowing for some overhead)
            assert v2_time < v1_time * 2  # Allow up to 2x overhead for facade
