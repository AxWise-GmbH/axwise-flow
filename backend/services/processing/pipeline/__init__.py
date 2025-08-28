"""
Processing pipeline package.

This package contains implementations of the processing pipeline components
for analyzing interview data. Each component is responsible for a specific
aspect of the processing, and they are orchestrated by the pipeline.
"""

from backend.services.processing.pipeline.base_processor import BaseProcessor
from backend.services.processing.pipeline.processing_pipeline import ProcessingPipeline
from backend.services.processing.pipeline.transcript_processor import (
    TranscriptProcessor,
)
from backend.services.processing.pipeline.factory import PipelineFactory
from backend.services.processing.pipeline.nlp_processor_facade import NLPProcessorFacade
from backend.services.processing.pipeline.stakeholder_aware_transcript_processor import (
    StakeholderAwareTranscriptProcessor,
)

__all__ = [
    "BaseProcessor",
    "ProcessingPipeline",
    "TranscriptProcessor",
    "PipelineFactory",
    "NLPProcessorFacade",
    "StakeholderAwareTranscriptProcessor",
]
