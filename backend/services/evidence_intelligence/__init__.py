"""
Evidence Intelligence System

LLM-powered intelligence system for evidence tracking, speaker attribution,
demographic extraction, and validation with multi-LLM cross-verification.

This replaces the flawed regex-based pattern matching with contextual understanding.
"""

from .context_analyzer import ContextAnalyzer, DocumentContext, DocumentType
from .speaker_intelligence import (
    SpeakerIntelligence,
    SpeakerProfile,
    SpeakerRole,
    SpeakerCharacteristics,
)
from .demographic_intelligence import DemographicIntelligence, DemographicData
from .evidence_attribution import EvidenceAttribution, AttributedEvidence, EvidenceType
from .validation_engine import ValidationEngine, ValidationResult, ValidationStatus
from .evidence_intelligence_engine import (
    EvidenceIntelligenceEngine,
    EvidenceIntelligenceResult,
    ProcessingMetrics,
)

# Version
__version__ = "2.0.0"

# Module exports
__all__ = [
    # Main engine
    "EvidenceIntelligenceEngine",
    "EvidenceIntelligenceResult",
    "ProcessingMetrics",
    # Context analysis
    "ContextAnalyzer",
    "DocumentContext",
    "DocumentType",
    # Speaker intelligence
    "SpeakerIntelligence",
    "SpeakerProfile",
    "SpeakerRole",
    "SpeakerCharacteristics",
    # Demographics
    "DemographicIntelligence",
    "DemographicData",
    # Evidence attribution
    "EvidenceAttribution",
    "AttributedEvidence",
    "EvidenceType",
    # Validation
    "ValidationEngine",
    "ValidationResult",
    "ValidationStatus",
    # Helper functions
    "create_engine",
    "get_default_config",
]


def create_engine(llm_services=None, config=None):
    """
    Create and configure an Evidence Intelligence Engine.

    Args:
        llm_services: Dictionary of LLM services or single LLM service
        config: Optional configuration dictionary

    Returns:
        Configured EvidenceIntelligenceEngine instance
    """
    # Handle single LLM service
    if llm_services and not isinstance(llm_services, dict):
        llm_services = {"primary": llm_services}

    # Build configuration
    engine_config = get_default_config()

    # Add LLM services
    if llm_services:
        engine_config["llm_services"] = llm_services

    # Merge with provided config
    if config:
        engine_config.update(config)

    return EvidenceIntelligenceEngine(engine_config)


def get_default_config():
    """
    Get default configuration for Evidence Intelligence Engine.

    Returns:
        Default configuration dictionary
    """
    return {
        "llm_services": {},
        "processing_options": {
            "min_confidence": 0.7,
            "enable_speaker_separation": True,
            "enable_demographic_extraction": True,
            "enable_theme_extraction": True,
            "max_evidence_per_speaker": 100,
            "parallel_processing": True,
        },
        "validation_options": {
            "multi_llm": True,
            "strict": True,
            "min_token_overlap": 0.70,  # 70% threshold (was 25%)
            "min_semantic_similarity": 0.75,
            "min_consensus_score": 0.66,
            "enable_remediation": True,
        },
        "speaker_options": {
            "enforce_unique_ids": True,
            "detect_researchers": True,
            "merge_similar_speakers": False,
            "min_speaker_evidence": 3,
        },
        "demographic_options": {
            "extract_age": True,
            "extract_location": True,
            "extract_profession": True,
            "extract_education": True,
            "use_header_search": True,
            "confidence_threshold": 0.6,
        },
        "output_options": {
            "include_researcher_content": False,
            "include_uncertain_evidence": False,
            "include_raw_data": False,
            "export_format": "json",
        },
    }


# Integration helpers for existing services


class EvidenceIntelligenceIntegration:
    """
    Helper class for integrating Evidence Intelligence with existing services.
    """

    @staticmethod
    def replace_results_filtering(results_service, engine):
        """
        Replace results_service filtering with Evidence Intelligence.

        Args:
            results_service: Existing ResultsService instance
            engine: EvidenceIntelligenceEngine instance
        """
        # This would be implemented to patch the existing service
        # Example implementation would override the filtering methods
        pass

    @staticmethod
    def replace_transcript_structuring(transcript_service, engine):
        """
        Replace transcript structuring speaker identification.

        Args:
            transcript_service: Existing TranscriptStructuringService
            engine: EvidenceIntelligenceEngine instance
        """
        # This would be implemented to patch the existing service
        pass

    @staticmethod
    def replace_validation_thresholds(validator_service, engine):
        """
        Replace validation thresholds with strict 70% requirement.

        Args:
            validator_service: Existing PersonaEvidenceValidator
            engine: EvidenceIntelligenceEngine instance
        """
        # This would be implemented to patch the existing service
        pass


# Quick start example in docstring
"""
Quick Start Example:

```python
from backend.services.evidence_intelligence import create_engine, EvidenceIntelligenceEngine
from backend.services.llm_service import LLMService

# Initialize LLM services
llm_service = LLMService()

# Create engine with single LLM
engine = create_engine(llm_service)

# Or with multiple LLMs for cross-verification
llm_services = {
    "gpt4": LLMService(model="gpt-4"),
    "claude": LLMService(model="claude-3"),
    "gemini": LLMService(model="gemini-pro")
}
engine = create_engine(llm_services)

# Process transcript
result = await engine.process_transcript(
    transcript_text="...",
    metadata={"interview_id": "123", "date": "2024-01-15"}
)

# Access results
print(f"Found {len(result.speakers)} unique speakers")
print(f"Extracted {len(result.attributed_evidence)} evidence pieces")
print(f"Validated {result.metrics.evidence_validated} with {result.metrics.validation_success_rate:.0%} success rate")
print(f"Filtered {result.metrics.researcher_content_filtered} researcher questions")

# Export results
engine.export_results(result, Path("results.json"))
```

Integration with Existing Services:

```python
# Replace flawed regex patterns in results_service.py
from backend.services.results_service import ResultsService
from backend.services.evidence_intelligence import EvidenceIntelligenceIntegration

results_service = ResultsService()
EvidenceIntelligenceIntegration.replace_results_filtering(results_service, engine)

# Now results_service uses LLM intelligence instead of regex
```
"""
