"""
Stakeholder Analysis V2 Facade

Orchestrates modular components behind a feature flag while maintaining
backward compatibility with the existing StakeholderAnalysisService API.
"""

from typing import List, Dict, Any, Optional
import os
import logging

from backend.domain.interfaces.llm_unified import ILLMService
from backend.schemas import (
    StakeholderIntelligence,
    DetectedStakeholder,
    CrossStakeholderPatterns,
    MultiStakeholderSummary,
    DetailedAnalysisResult,
)

from .detector import StakeholderDetector
from .theme_analyzer import StakeholderThemeAnalyzer
from .evidence_aggregator import EvidenceAggregator
from .influence_calculator import InfluenceMetricsCalculator
from .report_assembler import StakeholderReportAssembler
from .validation import StakeholderAnalysisValidation

logger = logging.getLogger(__name__)


class StakeholderAnalysisFacade:
    """
    Modular facade for stakeholder analysis that orchestrates individual components
    while maintaining backward compatibility with the existing API.
    """

    def __init__(self, llm_service: ILLMService):
        self.llm_service = llm_service

        # Initialize modular components
        self.detector = StakeholderDetector(llm_service)
        self.theme_analyzer = StakeholderThemeAnalyzer(llm_service)
        self.evidence_aggregator = EvidenceAggregator(llm_service)
        self.influence_calculator = InfluenceMetricsCalculator(llm_service)
        self.report_assembler = StakeholderReportAssembler(llm_service)
        self.validator = StakeholderAnalysisValidation()

    async def enhance_analysis_with_stakeholder_intelligence(
        self,
        base_analysis: DetailedAnalysisResult,
        files: List[Any],
        personas: Optional[List[Dict[str, Any]]] = None,
    ) -> DetailedAnalysisResult:
        """
        Main entry point that mirrors the original service API while using modular components.

        Args:
            base_analysis: Base analysis result to enhance
            files: Interview files for analysis
            personas: Optional personas for stakeholder mapping

        Returns:
            Enhanced analysis result with stakeholder intelligence
        """
        logger.info("Starting V2 modular stakeholder analysis")

        try:
            # Phase 1: Stakeholder Detection
            detected_stakeholders = await self.detector.detect_stakeholders(
                files, base_analysis, personas
            )

            # Phase 2: Cross-stakeholder Pattern Analysis
            cross_patterns = await self.influence_calculator.analyze_patterns(
                detected_stakeholders, files
            )

            # Phase 3: Multi-stakeholder Summary
            multi_summary = await self.report_assembler.generate_summary(
                detected_stakeholders, cross_patterns, files
            )

            # Phase 4: Theme Attribution Enhancement
            enhanced_themes = await self.theme_analyzer.enhance_themes_with_attribution(
                base_analysis.themes, detected_stakeholders, files
            )

            # Phase 5: Evidence Aggregation
            aggregated_evidence = await self.evidence_aggregator.aggregate_evidence(
                detected_stakeholders, files
            )

            # Assemble final result
            enhanced_analysis = self.report_assembler.assemble_final_result(
                base_analysis=base_analysis,
                stakeholder_intelligence=StakeholderIntelligence(
                    detected_stakeholders=detected_stakeholders,
                    cross_stakeholder_patterns=cross_patterns,
                    multi_stakeholder_summary=multi_summary,
                ),
                enhanced_themes=enhanced_themes,
                evidence=aggregated_evidence,
            )

            # Validate result
            validated_analysis = self.validator.validate_analysis_result(
                enhanced_analysis
            )

            logger.info("V2 modular stakeholder analysis completed successfully")
            return validated_analysis

        except Exception as e:
            logger.error(f"V2 stakeholder analysis failed: {e}")
            # Return original analysis as fallback
            return base_analysis

    def _use_v2(self) -> bool:
        """Feature flag gate for STAKEHOLDER_ANALYSIS_V2."""
        return os.getenv("STAKEHOLDER_ANALYSIS_V2", "false").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
