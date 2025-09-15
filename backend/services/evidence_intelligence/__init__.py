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
from .exclusive_llm_intelligence import ExclusiveLLMIntelligence, ExclusiveLLMProcessor

# Version
__version__ = "3.0.0"  # Major version for exclusive LLM implementation

# Module exports
__all__ = [
    # Main engines
    "EvidenceIntelligenceEngine",
    "EvidenceIntelligenceResult",
    "ProcessingMetrics",
    # Exclusive LLM implementation
    "ExclusiveLLMIntelligence",
    "ExclusiveLLMProcessor",
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
    "create_exclusive_llm_engine",
    "get_default_config",
]


def create_exclusive_llm_engine(llm_service):
    """
    Create an Exclusive LLM Evidence Intelligence Engine.

    This engine uses ONLY LLM understanding with:
    - ZERO regex patterns
    - ZERO rule-based logic
    - ZERO traditional NLP
    - Pure contextual comprehension

    Args:
        llm_service: LLM service for all understanding tasks

    Returns:
        ExclusiveLLMProcessor instance
    """
    from .exclusive_llm_intelligence import ExclusiveLLMProcessor

    return ExclusiveLLMProcessor(llm_service)


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
    def replace_with_exclusive_llm(service, llm_service):
        """
        Replace any service with Exclusive LLM Intelligence.

        This completely eliminates ALL regex patterns and traditional NLP,
        replacing them with pure LLM understanding.

        Args:
            service: Existing service to replace
            llm_service: LLM service for exclusive use

        Returns:
            ExclusiveLLMProcessor instance
        """
        from .exclusive_llm_intelligence import ExclusiveLLMProcessor

        # Create exclusive LLM processor
        processor = ExclusiveLLMProcessor(llm_service)

        # Log the replacement
        import logging

        logger = logging.getLogger(__name__)
        logger.info(
            f"Replaced {service.__class__.__name__} with Exclusive LLM Intelligence"
        )
        logger.info("ZERO patterns, ZERO rules - ONLY LLM understanding")

        return processor

    @staticmethod
    def replace_results_filtering(results_service, engine):
        """
        Replace results_service filtering with Evidence Intelligence.

        Args:
            results_service: Existing ResultsService instance
            engine: EvidenceIntelligenceEngine instance
        """
        # This would be implemented to patch the existing service
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
Quick Start Example - Exclusive LLM Implementation:

```python
from backend.services.evidence_intelligence import create_exclusive_llm_engine
from backend.services.llm_service import LLMService

# Initialize LLM service
llm_service = LLMService()

# Create EXCLUSIVE LLM engine (ZERO patterns)
engine = create_exclusive_llm_engine(llm_service)

# Process transcript with pure LLM understanding
result = await engine.process(transcript_text)

# Access results
print(f"Processing method: {result['implementation']}")  # "EXCLUSIVE_LLM"
print(f"Patterns used: {result['patterns_used']}")  # 0
print(f"Pure LLM: {result['pure_llm']}")  # True

# All three bugs are solved through understanding:
# 1. Age extraction works: "John Miller, Age: 56" → 56
# 2. Researcher questions excluded from evidence
# 3. Validation reports actual mismatches
```

Traditional Implementation (with patterns):

```python
from backend.services.evidence_intelligence import create_engine

# Create traditional engine (uses some patterns)
engine = create_engine(llm_services)
result = await engine.process_transcript(transcript_text)
```

Integration with Existing Services:

```python
# Replace EVERYTHING with Exclusive LLM
from backend.services.evidence_intelligence import EvidenceIntelligenceIntegration
from backend.services.results_service import ResultsService

results_service = ResultsService()
exclusive_llm_processor = EvidenceIntelligenceIntegration.replace_with_exclusive_llm(
    results_service,
    llm_service
)

# Now ALL processing uses ONLY LLM understanding
result = await exclusive_llm_processor.process(transcript)
```
"""
