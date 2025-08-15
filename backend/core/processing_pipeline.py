"""
Processing pipeline for interview data analysis.
"""

import logging
import asyncio
import json  # Import json for logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


async def process_data(
    nlp_processor,
    llm_service,
    data: Any,
    config: Dict[str, Any] = None,
    progress_callback=None,
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
        if config.get("use_enhanced_theme_analysis"):
            logger.info("Using enhanced thematic analysis")

        # Report progress: Starting analysis
        if progress_callback:
            await progress_callback("ANALYSIS", 0.1, "Starting interview data analysis")

        # Process data through NLP pipeline
        # The NLP processor now handles different data formats internally
        logger.info("Calling nlp_processor.process_interview_data...")

        results = await nlp_processor.process_interview_data(
            data, llm_service, config, progress_callback
        )

        # Progress updates are now handled inside the NLP processor

        # DEBUG LOG: Inspect results immediately after processing
        logger.info("Returned from nlp_processor.process_interview_data.")

        logger.debug(
            f"[process_data] Results after nlp_processor.process_interview_data:"
        )
        try:
            # Attempt to log a pretty-printed version, fallback to raw if error
            logger.debug(json.dumps(results, indent=2, default=str))
        except Exception as log_err:
            logger.debug(f"(Logging error: {log_err}) Raw results: {results}")

        # Validate results
        logger.info("Validating analysis results")
        logger.info("Calling nlp_processor.validate_results...")

        # Progress updates are now handled inside the NLP processor

        # Use the new return type (is_valid, missing_fields)
        is_valid, missing_fields = await nlp_processor.validate_results(results)

        if not is_valid:
            logger.warning(f"Validation issues: {missing_fields}")
            # Continue anyway - we're being more lenient now
            logger.info("Continuing despite validation issues to be more resilient")

        # Progress updates are now handled inside the NLP processor

        # CORE STAKEHOLDER DETECTION - Always run as part of standard pipeline
        logger.info("Starting stakeholder intelligence analysis...")
        if progress_callback:
            await progress_callback(
                "STAKEHOLDER_ANALYSIS", 0.6, "Analyzing stakeholder intelligence"
            )

        try:
            # Import stakeholder analysis service
            from backend.services.stakeholder_analysis_service import (
                StakeholderAnalysisService,
            )
            from backend.utils.persona_utils import normalize_persona_list

            # Initialize stakeholder analysis service
            stakeholder_service = StakeholderAnalysisService(llm_service)

            # Prepare data for stakeholder analysis
            # Convert data to the format expected by stakeholder service
            if isinstance(data, list):
                files_data = data
            elif isinstance(data, dict):
                files_data = [data]
            else:
                files_data = [{"content": str(data), "filename": "interview.txt"}]

            # Normalize personas to handle type compatibility
            if "personas" in results and results["personas"]:
                results["personas"] = normalize_persona_list(results["personas"])

            # Convert results dictionary to DetailedAnalysisResult object for stakeholder analysis
            from schemas import DetailedAnalysisResult
            from datetime import datetime, timezone

            # Create a proper DetailedAnalysisResult object from the results dictionary
            base_analysis = DetailedAnalysisResult(
                id="temp_id",  # Temporary ID for processing
                status="pending",  # Use valid status value for schema validation
                createdAt=datetime.now(timezone.utc).isoformat(),
                fileName="processing",
                themes=results.get("themes", []),
                patterns=results.get("patterns", []),
                sentimentOverview=results.get(
                    "sentimentOverview",
                    {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                ),
                sentiment=results.get("sentiment", []),
                personas=results.get("personas", []),
                insights=results.get("insights", []),
            )

            # Run stakeholder analysis with the proper base analysis object
            enhanced_results = await stakeholder_service.enhance_analysis_with_stakeholder_intelligence(
                files_data, base_analysis
            )

            # Update results with stakeholder intelligence from the enhanced analysis object
            if (
                hasattr(enhanced_results, "stakeholder_intelligence")
                and enhanced_results.stakeholder_intelligence
            ):
                # Convert Pydantic model to dictionary for JSON serialization
                if hasattr(enhanced_results.stakeholder_intelligence, "model_dump"):
                    results["stakeholder_intelligence"] = (
                        enhanced_results.stakeholder_intelligence.model_dump()
                    )
                else:
                    results["stakeholder_intelligence"] = (
                        enhanced_results.stakeholder_intelligence
                    )
                logger.info(
                    f"✅ Successfully extracted stakeholder intelligence with {len(results['stakeholder_intelligence'].get('detected_stakeholders', []))} stakeholders"
                )
            else:
                # Ensure stakeholder_intelligence always exists, even if empty
                results["stakeholder_intelligence"] = {
                    "detected_stakeholders": [],
                    "processing_metadata": {"status": "no_stakeholders_detected"},
                }
                logger.info(
                    "⚠️ No stakeholder intelligence generated, using empty structure"
                )

            logger.info(
                f"Stakeholder analysis completed. Detected stakeholders: {len(results.get('stakeholder_intelligence', {}).get('detected_stakeholders', []))}"
            )

        except Exception as e:
            logger.error(f"Error in stakeholder analysis: {str(e)}")
            # Always ensure stakeholder_intelligence exists, even on error
            results["stakeholder_intelligence"] = {
                "detected_stakeholders": [],
                "processing_metadata": {"status": "error", "error": str(e)},
            }

        # Extract additional insights
        logger.info("Calling nlp_processor.extract_insights...")

        logger.info("Extracting additional insights")

        # Pass the progress_callback to extract_insights
        insights_config = {"progress_callback": progress_callback}

        insights = await nlp_processor.extract_insights(
            results, llm_service, insights_config
        )

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
        logger.info(
            "Starting final result transformations (sentiment normalization)..."
        )

        # Report progress: Completion
        if progress_callback:
            await progress_callback("COMPLETION", 1.0, "Finalizing analysis results")

        # Return the main results dictionary which should contain insights after extract_insights call
        logger.debug(
            f"[process_data] Final results being returned (keys): {list(results.keys())}"
        )  # Log keys before returning
        return results

    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise
