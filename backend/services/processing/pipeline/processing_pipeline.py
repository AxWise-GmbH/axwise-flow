"""
Processing pipeline implementation.

This module provides an implementation of the processing pipeline interface that
orchestrates the execution of multiple processors.
"""

import logging
from typing import Any, Dict, List, Optional, Type

from backend.domain.pipeline.pipeline import IPipeline
from backend.domain.pipeline.processor import IProcessor
from backend.domain.pipeline.progress import IProgressTracker

logger = logging.getLogger(__name__)

class ProcessingPipeline(IPipeline):
    """
    Implementation of the processing pipeline interface.
    
    This class provides an implementation of the processing pipeline interface that
    orchestrates the execution of multiple processors. It manages the sequence of
    processing steps, passes data between processors, and tracks progress.
    """
    
    def __init__(self, processors: Optional[List[IProcessor]] = None, 
                progress_tracker: Optional[IProgressTracker] = None):
        """
        Initialize the pipeline.
        
        Args:
            processors: List of processors to include in the pipeline
            progress_tracker: Optional progress tracker
        """
        self._processors = processors or []
        self._progress_tracker = progress_tracker
        
        logger.info(f"Initialized processing pipeline with {len(self._processors)} processors")
    
    async def process(self, data: Any, context: Optional[Dict[str, Any]] = None) -> Any:
        """
        Process the input data through the pipeline.
        
        This method executes each processor in the pipeline in sequence, passing
        the output of one processor as input to the next.
        
        Args:
            data: The input data to process
            context: Optional context information for the processing
            
        Returns:
            The final processed data
        """
        if context is None:
            context = {}
            
        # Validate the pipeline before processing
        if not self.validate_pipeline():
            logger.error("Pipeline validation failed")
            raise ValueError("Pipeline validation failed")
        
        result = data
        total_processors = len(self._processors)
        
        logger.info(f"Starting pipeline processing with {total_processors} processors")
        
        for i, processor in enumerate(self._processors):
            # Update progress if a tracker is available
            if self._progress_tracker:
                progress = i / total_processors
                await self._progress_tracker.update_progress(
                    stage=processor.name,
                    progress=progress,
                    message=f"Processing with {processor.name}"
                )
                
                logger.info(f"Pipeline progress: {progress:.2f} - Starting {processor.name}")
            
            # Process the data with the current processor
            try:
                result = await processor.process(result, context)
            except Exception as e:
                logger.error(f"Error in processor {processor.name}: {str(e)}", exc_info=True)
                # Add error information to the context
                context.setdefault("errors", []).append({
                    "processor": processor.name,
                    "error": str(e)
                })
                # Continue with the next processor
                continue
        
        # Update progress to completion
        if self._progress_tracker:
            await self._progress_tracker.update_progress(
                stage="Completion",
                progress=1.0,
                message="Processing complete"
            )
            
            logger.info("Pipeline processing complete")
        
        return result
    
    def add_processor(self, processor: IProcessor) -> None:
        """
        Add a processor to the pipeline.
        
        Args:
            processor: The processor to add
        """
        self._processors.append(processor)
        logger.info(f"Added processor {processor.name} to pipeline")
    
    def remove_processor(self, processor_name: str) -> bool:
        """
        Remove a processor from the pipeline.
        
        Args:
            processor_name: The name of the processor to remove
            
        Returns:
            True if the processor was removed, False otherwise
        """
        for i, processor in enumerate(self._processors):
            if processor.name == processor_name:
                self._processors.pop(i)
                logger.info(f"Removed processor {processor_name} from pipeline")
                return True
        
        logger.warning(f"Processor {processor_name} not found in pipeline")
        return False
    
    def get_processors(self) -> List[IProcessor]:
        """
        Get all processors in the pipeline.
        
        Returns:
            List of processors in the pipeline
        """
        return self._processors.copy()
    
    def set_progress_tracker(self, progress_tracker: IProgressTracker) -> None:
        """
        Set the progress tracker for the pipeline.
        
        Args:
            progress_tracker: The progress tracker to use
        """
        self._progress_tracker = progress_tracker
        logger.info("Set progress tracker for pipeline")
    
    def get_progress_tracker(self) -> Optional[IProgressTracker]:
        """
        Get the progress tracker for the pipeline.
        
        Returns:
            The progress tracker, or None if not set
        """
        return self._progress_tracker
    
    def validate_pipeline(self) -> bool:
        """
        Validate that the pipeline is properly configured.
        
        This method checks that the processors are compatible with each other,
        i.e., the output type of each processor is compatible with the input type
        of the next processor in the pipeline.
        
        Returns:
            True if the pipeline is valid, False otherwise
        """
        if not self._processors:
            logger.warning("Pipeline has no processors")
            return False
        
        # Check that each processor's output type is compatible with the next processor's input type
        for i in range(len(self._processors) - 1):
            current_processor = self._processors[i]
            next_processor = self._processors[i + 1]
            
            output_type = current_processor.get_output_type()
            
            if not next_processor.supports_input_type(output_type):
                logger.error(
                    f"Processor {next_processor.name} does not support input type "
                    f"{output_type.__name__} from processor {current_processor.name}"
                )
                return False
        
        return True
