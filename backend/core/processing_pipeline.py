"""
Processing pipeline for interview data analysis.
"""

import logging
import asyncio
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

async def process_data(nlp_processor, llm_service, data: Any) -> Dict[str, Any]:
    """
    Process uploaded data through NLP pipeline.
    
    Args:
        nlp_processor: NLP processor instance
        llm_service: LLM service instance
        data: Interview data to process (can be a list, dictionary, or string)
        
    Returns:
        Dict[str, Any]: Analysis results
    """
    try:
        # Log processing start
        logger.info(f"Starting data processing pipeline with data type: {type(data)}")
        
        # Process data through NLP pipeline
        # The NLP processor now handles different data formats internally
        results = await nlp_processor.process_interview_data(data, llm_service)
        
        # Validate results
        logger.info("Validating analysis results")
        if not await nlp_processor.validate_results(results):
            raise ValueError("Invalid analysis results")
            
        # Extract additional insights
        logger.info("Extracting additional insights")
        insights = await nlp_processor.extract_insights(results, llm_service)
        
        # Process additional transformations on the results
        # Normalize sentiment values to ensure they're in the -1 to 1 range
        if "themes" in results and isinstance(results["themes"], list):
            for theme in results["themes"]:
                if isinstance(theme, dict) and "sentiment" in theme:
                    # Ensure sentiment is a number between -1 and 1
                    if isinstance(theme["sentiment"], str):
                        try:
                            theme["sentiment"] = float(theme["sentiment"])
                        except ValueError:
                            theme["sentiment"] = 0.0
                    
                    # Normalize the sentiment value
                    if isinstance(theme["sentiment"], (int, float)):
                        # If between 0-1, convert to -1 to 1 range
                        if 0 <= theme["sentiment"] <= 1:
                            theme["sentiment"] = (theme["sentiment"] * 2) - 1
                        # Ensure within -1 to 1 bounds
                        theme["sentiment"] = max(-1.0, min(1.0, theme["sentiment"]))
        
        if "patterns" in results and isinstance(results["patterns"], list):
            for pattern in results["patterns"]:
                if isinstance(pattern, dict) and "sentiment" in pattern:
                    # Ensure sentiment is a number between -1 and 1
                    if isinstance(pattern["sentiment"], str):
                        try:
                            pattern["sentiment"] = float(pattern["sentiment"])
                        except ValueError:
                            pattern["sentiment"] = 0.0
                    
                    # Normalize the sentiment value
                    if isinstance(pattern["sentiment"], (int, float)):
                        # If between 0-1, convert to -1 to 1 range
                        if 0 <= pattern["sentiment"] <= 1:
                            pattern["sentiment"] = (pattern["sentiment"] * 2) - 1
                        # Ensure within -1 to 1 bounds
                        pattern["sentiment"] = max(-1.0, min(1.0, pattern["sentiment"]))
        
        logger.info("Data processing pipeline completed successfully")
        return insights
        
    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise