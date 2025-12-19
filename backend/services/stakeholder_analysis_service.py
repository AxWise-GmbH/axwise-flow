"""
Multi-stakeholder analysis service

Provides comprehensive stakeholder intelligence analysis including:
- Stakeholder detection and profiling
- Cross-stakeholder pattern analysis (consensus, conflicts, influence)
- Multi-stakeholder summary and recommendations
- Enhanced theme attribution with stakeholder context

This is a thin wrapper that delegates to the modular V2 facade.
"""

from typing import List, Any
import logging

from backend.schemas import DetailedAnalysisResult
from backend.services.stakeholder_analysis_v2.facade import StakeholderAnalysisFacade

logger = logging.getLogger(__name__)


class StakeholderAnalysisService:
    """
    Service for multi-stakeholder analysis enhancement.

    This is a thin wrapper that delegates all work to the modular V2 facade.
    The V2 facade orchestrates:
    - StakeholderDetector: Detects stakeholders from files/personas
    - StakeholderThemeAnalyzer: Enhances themes with stakeholder attribution
    - EvidenceAggregator: Aggregates evidence across stakeholders
    - InfluenceMetricsCalculator: Analyzes cross-stakeholder patterns
    - StakeholderReportAssembler: Generates summaries and assembles results
    """

    def __init__(self, llm_service=None):
        """
        Initialize the stakeholder analysis service.

        Args:
            llm_service: LLM service for AI-powered analysis
        """
        self.llm_service = llm_service
        self._facade = StakeholderAnalysisFacade(llm_service)
        logger.info("Initialized StakeholderAnalysisService with V2 facade")

    async def enhance_analysis_with_stakeholder_intelligence(
        self, files: List[Any], base_analysis: DetailedAnalysisResult
    ) -> DetailedAnalysisResult:
        """
        Enhance existing analysis with stakeholder intelligence.

        Args:
            files: List of interview files to analyze
            base_analysis: Base analysis result to enhance

        Returns:
            Enhanced analysis result with stakeholder intelligence
        """
        logger.info(
            f"Starting stakeholder intelligence enhancement for {len(files)} files"
        )

        try:
            result = await self._facade.enhance_analysis_with_stakeholder_intelligence(
                base_analysis=base_analysis,
                files=files,
                personas=getattr(base_analysis, "personas", None),
            )
            logger.info("Stakeholder intelligence enhancement completed successfully")
            return result
        except Exception as e:
            logger.error(f"Stakeholder analysis failed: {e}", exc_info=True)
            # Return original analysis as fallback
            return base_analysis
