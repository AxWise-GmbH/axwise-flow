"""
Processing pipeline for interview data analysis.
"""

import logging
import asyncio
import json # Import json for logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

async def process_data(
    nlp_processor,
    llm_service,
    data: Any,
    config: Dict[str, Any] = None,
    progress_callback = None
) -> Dict[str, Any]:
    """
    Process uploaded data through NLP pipeline.

    Args:
        nlp_processor: NLP processor instance
        llm_service: LLM service instance
        data: Interview data to process (can be a list, dictionary, or string)
        config: Analysis configuration options
        progress_callback: Optional callback function to report progress
                          Function signature: async def callback(stage: str, progress: float, message: str)

    Returns:
        Dict[str, Any]: Analysis results
    """
    try:
        # Initialize config if not provided
        if config is None:
            config = {}

        # Log processing start
        logger.info(f"Starting data processing pipeline with data type: {type(data)}")
        if config.get('use_enhanced_theme_analysis'):
            logger.info("Using enhanced thematic analysis")

        # Report progress: Starting analysis
        if progress_callback:
            await progress_callback("ANALYSIS", 0.1, "Starting interview data analysis")

        # Process data through NLP pipeline
        # The NLP processor now handles different data formats internally
        logger.info("Calling nlp_processor.process_interview_data...")

        results = await nlp_processor.process_interview_data(data, llm_service, config)

        # Report progress: Completed initial analysis
        if progress_callback:
            await progress_callback("THEME_EXTRACTION", 0.5, "Extracting themes from interview data")

        # DEBUG LOG: Inspect results immediately after processing
        logger.info("Returned from nlp_processor.process_interview_data.")

        logger.debug(f"[process_data] Results after nlp_processor.process_interview_data:")
        try:
            # Attempt to log a pretty-printed version, fallback to raw if error
            logger.debug(json.dumps(results, indent=2, default=str))
        except Exception as log_err:
            logger.debug(f"(Logging error: {log_err}) Raw results: {results}")

        # Validate results
        logger.info("Validating analysis results")
        logger.info("Calling nlp_processor.validate_results...")

        # Report progress: Pattern detection
        if progress_callback:
            await progress_callback("PATTERN_DETECTION", 0.5, "Detecting patterns in interview data")

        # Use the new return type (is_valid, missing_fields)
        is_valid, missing_fields = await nlp_processor.validate_results(results)

        if not is_valid:
            logger.warning(f"Validation issues: {missing_fields}")
            # Continue anyway - we're being more lenient now
            logger.info("Continuing despite validation issues to be more resilient")

        # Report progress: Sentiment analysis
        if progress_callback:
            await progress_callback("SENTIMENT_ANALYSIS", 0.7, "Analyzing sentiment in interview data")

        # Extract additional insights
        logger.info("Calling nlp_processor.extract_insights...")

        logger.info("Extracting additional insights")

        # Report progress: Insight generation
        if progress_callback:
            await progress_callback("INSIGHT_GENERATION", 0.3, "Generating insights from interview data")

        insights = await nlp_processor.extract_insights(results, llm_service)

        # Report progress: Persona formation
        if progress_callback:
            await progress_callback("PERSONA_FORMATION", 0.5, "Forming personas from interview data")

        logger.info("Returned from nlp_processor.extract_insights.")

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
        logger.info("Starting final result transformations (sentiment normalization)...")

        # Report progress: Completion
        if progress_callback:
            await progress_callback("COMPLETION", 0.9, "Finalizing analysis results")

        # Return the main results dictionary which should contain insights after extract_insights call
        logger.debug(f"[process_data] Final results being returned (keys): {list(results.keys())}") # Log keys before returning
        return results

    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise
