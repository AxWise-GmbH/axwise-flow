"""
Stakeholder Analysis V2 modular package.

This package provides a thin, modular façade over the existing
StakeholderAnalysisService pipeline, enabling:
- Facade orchestration behind a feature flag (STAKEHOLDER_ANALYSIS_V2)
- Pluggable components (Detector, ThemeAnalyzer, EvidenceAggregator, InfluenceCalculator, ReportAssembler)
- Assembler that composes component outputs and delegates to existing logic
- Validation utilities ensuring schema compliance

Backwards compatibility is preserved: outputs retain the current shape.
"""
from .facade import StakeholderAnalysisFacade
from .detector import StakeholderDetector
from .theme_analyzer import StakeholderThemeAnalyzer
from .evidence_aggregator import EvidenceAggregator
from .influence_calculator import InfluenceMetricsCalculator
from .report_assembler import StakeholderReportAssembler
from .validation import StakeholderAnalysisValidation

__all__ = [
    "StakeholderAnalysisFacade",
    "StakeholderDetector",
    "StakeholderThemeAnalyzer",
    "EvidenceAggregator",
    "InfluenceMetricsCalculator",
    "StakeholderReportAssembler",
    "StakeholderAnalysisValidation",
]
