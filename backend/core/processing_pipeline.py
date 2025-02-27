"""
Processing pipeline for interview data analysis.
"""

import logging
import asyncio
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

async def process_data(nlp_processor, llm_service, data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Process uploaded data through NLP pipeline.
    
    Args:
        nlp_processor: NLP processor instance
        llm_service: LLM service instance
        data: List of interview data to process
        
    Returns:
        Dict[str, Any]: Analysis results
    """
    try:
        # Log processing start
        logger.info(f"Starting data processing pipeline")
        
        # Process data through NLP pipeline
        results = await nlp_processor.process_interview_data(data, llm_service)
        
        # Validate results
        logger.info("Validating analysis results")
        if not await nlp_processor.validate_results(results):
            raise ValueError("Invalid analysis results")
            
        # Extract additional insights
        logger.info("Extracting additional insights")
        insights = await nlp_processor.extract_insights(results, llm_service)
        
        logger.info("Data processing pipeline completed successfully")
        return insights
        
    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise