"""
Pipeline factory implementation.

This module provides a factory for creating processing pipelines with different
configurations.
"""

import logging
from typing import Dict, Any, List, Optional

from backend.domain.pipeline.processor import IProcessor
from backend.domain.pipeline.progress import IProgressTracker
from backend.services.processing.pipeline.processing_pipeline import ProcessingPipeline
from backend.services.processing.pipeline.transcript_processor import TranscriptProcessor

logger = logging.getLogger(__name__)

class PipelineFactory:
    """
    Factory for creating processing pipelines.
    
    This class provides methods for creating processing pipelines with different
    configurations. It handles the creation and configuration of processors and
    their dependencies.
    """
    
    @staticmethod
    def create_default_pipeline(llm_service, progress_tracker: Optional[IProgressTracker] = None) -> ProcessingPipeline:
        """
        Create the default processing pipeline.
        
        This method creates a pipeline with all available processors in the
        standard order.
        
        Args:
            llm_service: LLM service to use for processing
            progress_tracker: Optional progress tracker
            
        Returns:
            Configured processing pipeline
        """
        # Create the pipeline
        pipeline = ProcessingPipeline(progress_tracker=progress_tracker)
        
        # Create and add the transcript processor
        transcript_processor = TranscriptProcessor(llm_service)
        pipeline.add_processor(transcript_processor)
        
        # TODO: Add other processors as they are implemented
        # pipeline.add_processor(ThemeAnalyzer(llm_service))
        # pipeline.add_processor(PatternRecognizer(llm_service))
        # pipeline.add_processor(SentimentAnalyzer(llm_service))
        # pipeline.add_processor(InsightGenerator(llm_service))
        # pipeline.add_processor(PersonaGenerator(llm_service))
        
        logger.info("Created default processing pipeline")
        return pipeline
    
    @staticmethod
    def create_transcript_only_pipeline(llm_service, progress_tracker: Optional[IProgressTracker] = None) -> ProcessingPipeline:
        """
        Create a pipeline that only processes transcripts.
        
        This method creates a pipeline with only the transcript processor.
        
        Args:
            llm_service: LLM service to use for processing
            progress_tracker: Optional progress tracker
            
        Returns:
            Configured processing pipeline
        """
        # Create the pipeline
        pipeline = ProcessingPipeline(progress_tracker=progress_tracker)
        
        # Create and add the transcript processor
        transcript_processor = TranscriptProcessor(llm_service)
        pipeline.add_processor(transcript_processor)
        
        logger.info("Created transcript-only processing pipeline")
        return pipeline
    
    @staticmethod
    def create_custom_pipeline(llm_service, processor_names: List[str], 
                              progress_tracker: Optional[IProgressTracker] = None) -> ProcessingPipeline:
        """
        Create a custom processing pipeline.
        
        This method creates a pipeline with the specified processors in the
        specified order.
        
        Args:
            llm_service: LLM service to use for processing
            processor_names: List of processor names to include
            progress_tracker: Optional progress tracker
            
        Returns:
            Configured processing pipeline
        """
        # Create the pipeline
        pipeline = ProcessingPipeline(progress_tracker=progress_tracker)
        
        # Create and add processors based on names
        for name in processor_names:
            processor = PipelineFactory._create_processor(name, llm_service)
            if processor:
                pipeline.add_processor(processor)
        
        logger.info(f"Created custom processing pipeline with processors: {processor_names}")
        return pipeline
    
    @staticmethod
    def _create_processor(name: str, llm_service) -> Optional[IProcessor]:
        """
        Create a processor by name.
        
        Args:
            name: Name of the processor to create
            llm_service: LLM service to use for processing
            
        Returns:
            Created processor, or None if the name is not recognized
        """
        if name.lower() == "transcript":
            return TranscriptProcessor(llm_service)
        # TODO: Add other processors as they are implemented
        # elif name.lower() == "theme":
        #     return ThemeAnalyzer(llm_service)
        # elif name.lower() == "pattern":
        #     return PatternRecognizer(llm_service)
        # elif name.lower() == "sentiment":
        #     return SentimentAnalyzer(llm_service)
        # elif name.lower() == "insight":
        #     return InsightGenerator(llm_service)
        # elif name.lower() == "persona":
        #     return PersonaGenerator(llm_service)
        else:
            logger.warning(f"Unknown processor name: {name}")
            return None
