"""
Processing pipeline package.

This package contains implementations of the processing pipeline components
for analyzing interview data. Each component is responsible for a specific
aspect of the processing, and they are orchestrated by the pipeline.
"""

from backend.services.processing.pipeline.base_processor import BaseProcessor
from backend.services.processing.pipeline.processing_pipeline import ProcessingPipeline
from backend.services.processing.pipeline.transcript_processor import TranscriptProcessor
from backend.services.processing.pipeline.theme_analyzer import ThemeAnalyzer
from backend.services.processing.pipeline.pattern_recognizer import PatternRecognizer
from backend.services.processing.pipeline.sentiment_analyzer import SentimentAnalyzer
from backend.services.processing.pipeline.insight_generator import InsightGenerator
from backend.services.processing.pipeline.persona_generator import PersonaGenerator
from backend.services.processing.pipeline.industry_detector import IndustryDetector
from backend.services.processing.pipeline.factory import PipelineFactory
from backend.services.processing.pipeline.nlp_processor_facade import NLPProcessorFacade

__all__ = [
    'BaseProcessor',
    'ProcessingPipeline',
    'TranscriptProcessor',
    'ThemeAnalyzer',
    'PatternRecognizer',
    'SentimentAnalyzer',
    'InsightGenerator',
    'PersonaGenerator',
    'IndustryDetector',
    'PipelineFactory',
    'NLPProcessorFacade',
]
