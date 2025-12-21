"""NLP processor service"""

import logging
import asyncio
import json
import os
import re
import copy
import importlib.util
from typing import Dict, Any, List, Tuple, Optional
from backend.services.llm.base_llm_service import BaseLLMService as ILLMService

from backend.schemas import DetailedAnalysisResult
from backend.services.nlp.data_extraction import (
    combine_transcript_text,
    parse_free_text,
    extract_texts_from_data,
)
from backend.services.nlp.helpers import (
    determine_pattern_category,
    generate_detailed_description,
    generate_specific_impact,
    generate_actionable_recommendations,
    process_sentiment_results,
    validate_results as validate_results_helper,
    create_minimal_sentiment_result,
)

logger = logging.getLogger(__name__)


class NLPProcessor:
    """NLP processor implementation"""

    def __init__(self):
        """Initialize NLP processor without dependencies"""
        logger.info("Initializing NLP processor")

        # Try to import the extract_patterns method
        try:
            # Check if the extract_patterns module exists
            if importlib.util.find_spec("backend.services.nlp.extract_patterns"):
                # Import the module
                from backend.services.nlp.extract_patterns import extract_patterns

                # Monkey patch the extract_patterns method
                self.extract_patterns = extract_patterns.__get__(self, NLPProcessor)
                logger.info("Using new extract_patterns implementation")
        except ImportError:
            logger.info("Using legacy extract_patterns implementation")

    def _combine_transcript_text(self, transcript):
        """Combine transcript text from various formats into a single string."""
        return combine_transcript_text(transcript)

    async def parse_free_text(self, text: str) -> List[Dict[str, str]]:
        """Parse free-text interview transcripts to extract question-answer pairs."""
        return await parse_free_text(text)

    async def process_interview_data(
        self,
        data: Dict[str, Any],
        llm_service,
        config=None,
        progress_callback=None,
        analysis_id=None,
    ) -> Dict[str, Any]:
        """Process interview data to extract insights"""
        if config is None:
            config = {}

        # Store analysis_id for quality tracking
        self.current_analysis_id = analysis_id

        # 🔍 DEBUG: Log pipeline start
        logger.info(
            f"🚀 [PIPELINE_DEBUG] Starting main pipeline for analysis_id: {analysis_id}"
        )
        logger.info(f"🔧 [PIPELINE_DEBUG] Config: {config}")
        logger.info(f"📊 [PIPELINE_DEBUG] Data type: {type(data)}")
        if isinstance(data, dict):
            logger.info(f"📊 [PIPELINE_DEBUG] Data keys: {list(data.keys())}")

        # Solution 1: Enable enhanced theme analysis by default
        use_enhanced_theme_analysis = config.get(
            "use_enhanced_theme_analysis", True
        )  # Changed default to True
        logger.info(
            f"Enhanced theme analysis is {'enabled' if use_enhanced_theme_analysis else 'disabled'}"
        )

        # Helper function to update progress
        async def update_progress(stage: str, progress: float, message: str):
            if progress_callback:
                await progress_callback(stage, progress, message)

        try:
            # Extract text content
            texts = []
            answer_texts = []  # Explicitly track answer-only content for theme analysis
            stakeholder_aware_text = None  # Stakeholder-aware text for persona generation

            # Extract metadata if available
            metadata = {}
            if isinstance(data, dict) and "metadata" in data:
                metadata = data.get("metadata", {})
                logger.info(f"Extracted metadata: {metadata}")

            # Store filename from metadata if available
            filename = None
            if metadata and "filename" in metadata:
                filename = metadata.get("filename")
                logger.info(f"Using filename from metadata: {filename}")

                # Check if this is a Problem_demo file
                if filename and "Problem_demo" in filename:
                    logger.info(
                        f"Detected Problem_demo file: {filename}. Special handling will be applied."
                    )

            # Detect and handle free-text format
            free_text_processed = False
            if (
                isinstance(data, str)
                or (isinstance(data, dict) and "free_text" in data)
                or (
                    isinstance(data, list)
                    and len(data) == 1
                    and isinstance(data[0], dict)
                    and "free_text" in data[0]
                )
            ):
                logger.info("Detected free-text format input")
                if isinstance(data, str):
                    raw_text = data
                elif isinstance(data, dict):
                    raw_text = data.get("free_text", "")
                else:  # List with single dict containing free_text
                    raw_text = data[0].get("free_text", "")
                    logger.info("Extracted free_text from list format")

                if not raw_text or not isinstance(raw_text, str):
                    logger.error(f"Invalid or empty free text input: {raw_text}")
                    raise ValueError("Invalid or empty free text input")

                # Parse free text to extract Q&A pairs
                qa_pairs = await self.parse_free_text(raw_text)
                logger.info(f"Extracted {len(qa_pairs)} Q/A pairs from free text")

                # Process extracted Q&A pairs
                for item in qa_pairs:
                    question = item.get("question", "")
                    answer = item.get("answer", "")
                    if question and answer:
                        combined_text = f"Q: {question}\nA: {answer}"
                        texts.append(combined_text)
                        # Store answer-only version for theme analysis
                        answer_texts.append(answer)

                free_text_processed = True

            # Handle existing JSON data formats
            elif isinstance(data, list) and not free_text_processed:
                # Handle Excel format (list of objects with persona and respondents)
                logger.info("Processing list format data")
                for item in data:
                    if isinstance(item, dict):
                        # Handle Excel format with persona and respondents
                        if (
                            "persona" in item
                            and "respondents" in item
                            and isinstance(item["respondents"], list)
                        ):
                            logger.info(
                                f"Processing Excel format data with 'respondents' field for persona: {item.get('persona', 'Unknown')}"
                            )
                            for respondent in item["respondents"]:
                                if "answers" in respondent and isinstance(
                                    respondent["answers"], list
                                ):
                                    for qa_pair in respondent["answers"]:
                                        # Combine question and answer for better context
                                        question = qa_pair.get("question", "")
                                        answer = qa_pair.get("answer", "")
                                        if question and answer:
                                            combined_text = (
                                                f"Q: {question}\nA: {answer}"
                                            )
                                            texts.append(combined_text)
                                            # Store answer-only version for theme analysis
                                            answer_texts.append(answer)
                        # Handle flat format (list of question-answer pairs)
                        elif "question" in item and "answer" in item:
                            question = item.get("question", "")
                            answer = item.get("answer", "")
                            if question and answer:
                                combined_text = f"Q: {question}\nA: {answer}"
                                texts.append(combined_text)
                                # Store answer-only version for theme analysis
                                answer_texts.append(answer)
                        elif "text" in item:
                            # Fallback to text field only if no Q&A structure
                            texts.append(item["text"])
                            # Add to answer_texts as fallback, but log this case
                            logger.warning(
                                f"Using text field as fallback for theme analysis: {item['text'][:50]}..."
                            )
                            answer_texts.append(item["text"])
            elif isinstance(data, dict):
                # Handle enhanced simulation format (new format from simulation bridge)
                if "interviews" in data and "metadata" in data:
                    logger.info("✅ Processing enhanced simulation format data")

                    # Check for stakeholder-aware analysis_ready_text for persona generation
                    # This text contains the proper "--- INTERVIEW N ---\nStakeholder:" format
                    # that enables per-stakeholder persona generation
                    stakeholder_aware_text = data.get("analysis_ready_text")
                    if stakeholder_aware_text:
                        logger.info(
                            f"📋 Found stakeholder-aware analysis_ready_text ({len(stakeholder_aware_text)} chars)"
                        )

                    interview_count = 0
                    response_count = 0
                    for interview in data["interviews"]:
                        interview_count += 1
                        if "responses" in interview:
                            for response in interview["responses"]:
                                response_count += 1
                                question = response.get("question", "")
                                # Handle both "answer" and "response" fields
                                answer = response.get("answer", "") or response.get(
                                    "response", ""
                                )
                                if question and answer:
                                    combined_text = f"Q: {question}\nA: {answer}"
                                    texts.append(combined_text)
                                    answer_texts.append(answer)
                                    logger.debug(
                                        f"Enhanced format Q&A: {question[:50]}... -> {answer[:50]}..."
                                    )
                    logger.info(
                        f"🎯 Enhanced format: Processed {interview_count} interviews, {response_count} responses, extracted {len(texts)} text segments"
                    )
                # Handle Excel format with persona and respondents
                elif (
                    "persona" in data
                    and "respondents" in data
                    and isinstance(data["respondents"], list)
                ):
                    logger.info("Processing Excel format data with 'respondents' field")
                    for respondent in data["respondents"]:
                        if "answers" in respondent and isinstance(
                            respondent["answers"], list
                        ):
                            for qa_pair in respondent["answers"]:
                                # Combine question and answer for better context
                                question = qa_pair.get("question", "")
                                answer = qa_pair.get("answer", "")
                                if question and answer:
                                    combined_text = f"Q: {question}\nA: {answer}"
                                    texts.append(combined_text)
                                    # Store answer-only version for theme analysis
                                    answer_texts.append(answer)
                # Handle nested format with interviews containing responses
                elif "interviews" in data:
                    logger.info("Processing nested format data with 'interviews' field")
                    for interview in data["interviews"]:
                        if "responses" in interview:
                            for response in interview["responses"]:
                                # Combine question and answer for better context
                                question = response.get("question", "")
                                # Handle both "answer" and "response" fields (enhanced simulation uses "response")
                                answer = response.get("answer", "") or response.get(
                                    "response", ""
                                )
                                # Only use answer field, completely ignore text field
                                if question and answer:
                                    combined_text = f"Q: {question}\nA: {answer}"
                                    texts.append(combined_text)
                                    # Store answer-only version for theme analysis
                                    answer_texts.append(answer)
                                    logger.debug(
                                        f"Extracted Q&A: {question[:50]}... -> {answer[:50]}..."
                                    )
                        # Use text only if no responses
                        elif "text" in interview:
                            texts.append(interview["text"])
                            # Add to answer_texts as fallback, but log this case
                            logger.warning(
                                f"Using text field as fallback for theme analysis: {interview['text'][:50]}..."
                            )
                            answer_texts.append(interview["text"])
                # Handle direct flat format passed as a dict
                elif isinstance(data, dict) and "question" in data and "answer" in data:
                    logger.info("Processing single Q&A item")
                    question = data.get("question", "")
                    answer = data.get("answer", "")
                    if question and answer:
                        combined_text = f"Q: {question}\nA: {answer}"
                        texts.append(combined_text)
                        # Store answer-only version for theme analysis
                        answer_texts.append(answer)
                # Use text only if no interviews structure
                elif "text" in data:
                    texts.append(data["text"])
                    # Add to answer_texts as fallback, but log this case
                    logger.warning(
                        f"Using text field as fallback for theme analysis: {data['text'][:50]}..."
                    )
                    answer_texts.append(data["text"])

            if not texts:
                # Enhanced error logging to help debug data structure issues
                logger.error("❌ No text content found in data")
                logger.error(f"📊 Data type: {type(data)}")
                if isinstance(data, dict):
                    logger.error(f"🔑 Dict keys: {list(data.keys())}")
                    if "interviews" in data:
                        logger.error(f"📝 Interviews count: {len(data['interviews'])}")
                        if data["interviews"]:
                            first_interview = data["interviews"][0]
                            logger.error(
                                f"🔍 First interview keys: {list(first_interview.keys())}"
                            )
                            if "responses" in first_interview:
                                logger.error(
                                    f"💬 Responses count: {len(first_interview['responses'])}"
                                )
                                if first_interview["responses"]:
                                    first_response = first_interview["responses"][0]
                                    logger.error(
                                        f"🗣️ First response keys: {list(first_response.keys())}"
                                    )
                elif isinstance(data, list):
                    logger.error(f"📋 List length: {len(data)}")
                    if data:
                        logger.error(f"🔍 First item type: {type(data[0])}")
                        if isinstance(data[0], dict):
                            logger.error(f"🔑 First item keys: {list(data[0].keys())}")

                logger.error(f"📄 Data sample: {str(data)[:500]}...")
                raise ValueError("No text content found in data")

            # Process with LLM
            combined_text = "\n\n".join(filter(None, texts))
            # Create answer-only combined text for theme analysis
            answer_only_text = "\n\n".join(filter(None, answer_texts))

            logger.info(
                f"Processing {len(texts)} text segments and {len(answer_texts)} answer-only segments"
            )

            start_time = asyncio.get_event_loop().time()
            logger.info("Starting parallel analysis")

            # Update progress: Starting theme analysis
            await update_progress(
                "THEME_EXTRACTION", 0.2, "Starting enhanced theme analysis"
            )

            # Skip basic theme analysis and go directly to enhanced theme analysis
            logger.info("Using enhanced theme analysis directly")

            # Initialize variables
            basic_themes_task = None
            enhanced_themes_task = None

            # Import GeminiService for type checking
            from backend.services.llm.gemini_service import GeminiService

            # Default to passed service
            target_llm_service_enhanced = llm_service

            # Check if the primary service is Gemini
            if isinstance(llm_service, GeminiService):
                logger.info(
                    "Primary LLM is Gemini. Using gemini_new provider for enhanced theme analysis."
                )
                # Use the same LLM service for enhanced themes
                target_llm_service_enhanced = llm_service
                logger.info("Using primary LLM service for enhanced themes.")
            else:
                logger.info(
                    "Primary LLM is not Gemini. Using primary LLM for enhanced themes."
                )

            # Create enhanced theme analysis payload with filename if available
            logger.info(f"🔍 [THEME_DEBUG] answer_only_text length: {len(answer_only_text)}, preview: {answer_only_text[:300] if answer_only_text else 'EMPTY'}...")
            enhanced_theme_payload = {
                "task": "theme_analysis_enhanced",
                "text": answer_only_text,  # Use answer-only text for themes
                "use_answer_only": True,  # Flag to indicate answer-only processing
                "industry": config.get(
                    "industry"
                ),  # Pass industry context if available
            }
            logger.info(f"🔍 [THEME_DEBUG] Enhanced theme payload created with task: {enhanced_theme_payload['task']}, text length: {len(enhanced_theme_payload['text'])}")

            # Add filename to payload if available
            if filename:
                enhanced_theme_payload["filename"] = filename
                logger.info(
                    f"Adding filename to enhanced theme analysis payload: {filename}"
                )

            # Call analyze using the determined service for enhanced theme analysis
            enhanced_themes_task = target_llm_service_enhanced.analyze(
                enhanced_theme_payload
            )

            # Get enhanced themes directly
            logger.info("🎯 [PIPELINE_DEBUG] Awaiting enhanced themes task...")
            enhanced_themes_result = await enhanced_themes_task

            # CRITICAL DEBUG: Print to stdout to ensure we see it
            print(f"\n{'='*60}")
            print(f"🔥 [THEME_CRITICAL] Enhanced themes task completed.")
            print(f"🔥 [THEME_CRITICAL] Result type: {type(enhanced_themes_result)}")
            print(f"{'='*60}\n")

            logger.info(
                f"🎯 [PIPELINE_DEBUG] Enhanced themes task completed. Result type: {type(enhanced_themes_result)}"
            )

            # Log full result for debugging
            if isinstance(enhanced_themes_result, dict):
                if "error" in enhanced_themes_result:
                    print(f"🚨 [THEME_ERROR] LLM returned error: {enhanced_themes_result.get('error')}")
                    logger.error(f"🚨 [THEME_ERROR] LLM returned error: {enhanced_themes_result.get('error')}")
                print(f"🔥 [THEME_CRITICAL] Result keys: {list(enhanced_themes_result.keys())}")
                logger.info(f"🎯 [PIPELINE_DEBUG] Enhanced themes result keys: {list(enhanced_themes_result.keys())}")
                if "enhanced_themes" in enhanced_themes_result:
                    themes_count = len(enhanced_themes_result.get("enhanced_themes", []))
                    print(f"✅ [THEME_SUCCESS] Found {themes_count} enhanced themes in result")
                    logger.info(f"🎯 [PIPELINE_DEBUG] Found {themes_count} enhanced themes in result")
                    if themes_count > 0:
                        first_theme_name = enhanced_themes_result["enhanced_themes"][0].get("name", "No name")
                        print(f"✅ [THEME_SUCCESS] First theme name: {first_theme_name}")
                        logger.info(f"🎯 [PIPELINE_DEBUG] First theme name: {first_theme_name}")
                elif "themes" in enhanced_themes_result:
                    themes_count = len(enhanced_themes_result.get("themes", []))
                    print(f"⚠️ [THEME_FALLBACK] Found {themes_count} themes (not enhanced) in result")
                    logger.info(f"🎯 [PIPELINE_DEBUG] Found {themes_count} themes (not enhanced) in result")
                else:
                    print(f"❌ [THEME_MISSING] No themes or enhanced_themes key found in result!")
                    print(f"❌ [THEME_MISSING] Full result (first 500 chars): {str(enhanced_themes_result)[:500]}")
                    logger.warning(f"🚨 [THEME_WARNING] No themes or enhanced_themes key found in result!")

            # Update progress: Theme analysis completed
            await update_progress(
                "THEME_EXTRACTION", 0.4, "Enhanced theme analysis completed"
            )

            # Store the enhanced themes as the main themes result
            themes_result = {"themes": []}  # Initialize with empty themes
            logger.info(
                "🎯 [PIPELINE_DEBUG] Initialized themes_result with empty themes"
            )

            # Solution 2: Improve the handling of enhanced theme results
            try:
                # Log the full structure of the enhanced_themes_result for debugging
                logger.info(
                    f"Enhanced theme analysis result structure: {type(enhanced_themes_result)}"
                )
                if isinstance(enhanced_themes_result, dict):
                    logger.info(
                        f"Enhanced theme analysis result keys: {list(enhanced_themes_result.keys())}"
                    )
                    # Log the raw result for debugging
                    logger.debug(
                        f"Enhanced theme analysis raw result: {json.dumps(enhanced_themes_result)}"
                    )

                # Check for enhanced_themes key first (preferred)
                if (
                    isinstance(enhanced_themes_result, dict)
                    and "enhanced_themes" in enhanced_themes_result
                    and isinstance(enhanced_themes_result["enhanced_themes"], list)
                ):
                    logger.info(
                        f"Enhanced theme analysis completed with {len(enhanced_themes_result.get('enhanced_themes', []))} themes"
                    )
                    # Log the first theme if available
                    if enhanced_themes_result["enhanced_themes"]:
                        first_theme = enhanced_themes_result["enhanced_themes"][0]
                        logger.info(
                            f"First enhanced theme: {first_theme.get('name', 'Unnamed')}"
                        )
                # Fall back to themes key if enhanced_themes is not present
                elif (
                    isinstance(enhanced_themes_result, dict)
                    and "themes" in enhanced_themes_result
                    and isinstance(enhanced_themes_result["themes"], list)
                ):
                    logger.info(
                        f"Enhanced theme analysis returned regular themes with {len(enhanced_themes_result.get('themes', []))} themes"
                    )
                    # Copy themes to enhanced_themes for consistent handling
                    enhanced_themes_result["enhanced_themes"] = enhanced_themes_result[
                        "themes"
                    ]
                    logger.info(
                        "Copied themes to enhanced_themes for consistent handling"
                    )
                    # Log the first theme if available
                    if enhanced_themes_result["themes"]:
                        first_theme = enhanced_themes_result["themes"][0]
                        logger.info(
                            f"First theme (copied to enhanced_themes): {first_theme.get('name', 'Unnamed')}"
                        )
                # Handle direct list of themes (no wrapper object)
                elif (
                    isinstance(enhanced_themes_result, list)
                    and len(enhanced_themes_result) > 0
                ):
                    logger.info(
                        f"Enhanced theme analysis returned a direct list of {len(enhanced_themes_result)} themes"
                    )
                    # Wrap the list in a dictionary with enhanced_themes key
                    enhanced_themes_result = {"enhanced_themes": enhanced_themes_result}
                    logger.info(
                        "Wrapped theme list in enhanced_themes key for consistent handling"
                    )
                else:
                    logger.warning(
                        f"Enhanced theme analysis did not return expected structure. Keys: {list(enhanced_themes_result.keys()) if isinstance(enhanced_themes_result, dict) else 'not a dictionary'}"
                    )
                    # Create a default structure if the result is not as expected
                    enhanced_themes_result = {"enhanced_themes": []}
                    logger.warning(
                        "Created empty enhanced_themes structure as fallback"
                    )
            except Exception as e:
                logger.error(f"Error in enhanced theme analysis: {str(e)}")
                # Create a fallback enhanced themes result
                enhanced_themes_result = {"enhanced_themes": []}
                logger.warning("Created empty enhanced_themes structure due to error")

            # Solution 3: Improve the fallback mechanism
            # If enhanced themes are missing or empty, log and proceed with an empty list
            if not enhanced_themes_result or not enhanced_themes_result.get(
                "enhanced_themes"
            ):
                logger.warning(
                    "Enhanced themes not available or empty, proceeding with no themes instead of creating synthetic defaults"
                )
                # Ensure we always have a consistent structure for downstream code
                if not enhanced_themes_result:
                    enhanced_themes_result = {"enhanced_themes": []}
                elif "enhanced_themes" not in enhanced_themes_result:
                    enhanced_themes_result["enhanced_themes"] = []

            # Detect industry from the text
            industry = await self._detect_industry(combined_text, llm_service)
            logger.info(f"Detected industry: {industry}")

            # Update progress: Starting pattern detection
            await update_progress(
                "PATTERN_DETECTION", 0.45, "Starting pattern detection analysis"
            )

            # Create pattern recognition payload with filename if available
            pattern_payload = {
                "task": "pattern_recognition",
                "text": combined_text,
                "industry": industry,
            }

            # Add filename to payload if available
            if filename:
                pattern_payload["filename"] = filename
                logger.info(
                    f"Adding filename to pattern recognition payload: {filename}"
                )

            # Run pattern recognition using the new PatternService
            try:
                # Use the new extract_patterns method if available
                if hasattr(self, "extract_patterns"):
                    logger.info("Using new PatternService for pattern extraction")

                    async def get_patterns():
                        # Create a simple transcript structure from the combined text
                        simple_transcript = [{"text": combined_text}]
                        logger.info(
                            f"🔍 [PIPELINE_DEBUG] Starting patterns extraction with {len(themes_result.get('themes', []))} themes"
                        )
                        return await self.extract_patterns(
                            transcript=simple_transcript,
                            themes=themes_result.get("themes", []),
                            industry=industry,
                        )

                    patterns_task = asyncio.create_task(get_patterns())
                else:
                    logger.info(
                        "Falling back to legacy LLM service for pattern extraction"
                    )
                    patterns_task = llm_service.analyze(pattern_payload)
            except Exception as e:
                logger.error(f"Error in pattern extraction: {str(e)}")
                logger.info("Falling back to legacy LLM service for pattern extraction")
                patterns_task = llm_service.analyze(pattern_payload)

            # PERFORMANCE OPTIMIZATION: Sentiment analysis disabled
            # Sentiment analysis was never displayed to users (no sentiment tab in UI)
            # Disabling to improve performance and reduce processing time
            await update_progress(
                "SENTIMENT_ANALYSIS",
                0.5,
                "Skipping sentiment analysis (disabled for performance)",
            )

            # Create minimal sentiment result for schema compatibility
            sentiment_task = asyncio.create_task(
                self._create_minimal_sentiment_result()
            )

            # Wait for remaining tasks to complete
            logger.info(
                "⏳ [PIPELINE_DEBUG] Waiting for patterns and sentiment tasks..."
            )
            patterns_result, sentiment_result = await asyncio.gather(
                patterns_task, sentiment_task
            )
            logger.info(
                f"🔍 [PIPELINE_DEBUG] Patterns result: {len(patterns_result.get('patterns', []))} patterns"
            )
            logger.info(
                f"😊 [PIPELINE_DEBUG] Sentiment result keys: {list(sentiment_result.keys()) if isinstance(sentiment_result, dict) else 'not a dict'}"
            )

            # Update progress: Pattern detection completed
            await update_progress(
                "PATTERN_DETECTION", 0.6, "Pattern detection completed"
            )

            # Update progress: Sentiment analysis completed
            await update_progress(
                "SENTIMENT_ANALYSIS", 0.65, "Sentiment analysis completed"
            )

            parallel_duration = asyncio.get_event_loop().time() - start_time
            logger.info(
                f"Parallel analysis completed in {parallel_duration:.2f} seconds"
            )

            # Process and validate sentiment results before including them in the response
            # This ensures we only return high-quality sentiment data
            try:
                # Check if sentiment analysis was disabled
                if sentiment_result.get("disabled", False):
                    logger.info(
                        "Sentiment analysis was disabled, using minimal sentiment data"
                    )
                    processed_sentiment = []
                    # Store the minimal sentiment overview for schema compatibility
                    sentiment_overview = sentiment_result.get(
                        "sentiment_overview",
                        {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                    )
                else:
                    processed_sentiment = self._process_sentiment_results(
                        sentiment_result
                    )
                    logger.info(
                        f"Processed sentiment results: positive={len(processed_sentiment.get('positive', []))}, neutral={len(processed_sentiment.get('neutral', []))}, negative={len(processed_sentiment.get('negative', []))}"
                    )
                    sentiment_overview = None
            except Exception as e:
                logger.error(f"Error processing sentiment results: {str(e)}")
                # SCHEMA FIX: Use empty list instead of dictionary for schema compliance
                processed_sentiment = []
                sentiment_overview = {
                    "positive": 0.33,
                    "neutral": 0.34,
                    "negative": 0.33,
                }
                logger.warning("Using empty sentiment list due to processing error")

            # Be more resilient to partial failures - continue if at least some core results are present
            # This allows the pipeline to continue even if one analysis step fails
            try:
                # Check if we have at least some usable results
                has_basic_themes = len(themes_result.get("themes", [])) > 0
                has_enhanced_themes = enhanced_themes_result and (
                    len(enhanced_themes_result.get("enhanced_themes", [])) > 0
                    or len(enhanced_themes_result.get("themes", [])) > 0
                )
                has_patterns = len(patterns_result.get("patterns", [])) > 0

                # Log the status of each analysis component
                logger.info(
                    f"Analysis components status - Basic themes: {has_basic_themes}, "
                    + f"Enhanced themes: {has_enhanced_themes}, Patterns: {has_patterns}"
                )

                # Continue if we have at least some usable results
                # Ideally, we want both themes (basic OR enhanced) AND patterns, but we'll be more resilient
                if not has_patterns:
                    logger.warning(
                        "No patterns found from LLM, attempting to generate fallback patterns from themes"
                    )

                    # Generate fallback patterns from themes
                    fallback_patterns = await self._generate_fallback_patterns(
                        combined_text, themes_result.get("themes", []), llm_service
                    )

                    if fallback_patterns and len(fallback_patterns) > 0:
                        logger.info(
                            f"Successfully generated {len(fallback_patterns)} fallback patterns from themes"
                        )
                        patterns_result["patterns"] = fallback_patterns
                    else:
                        logger.warning(
                            "Failed to generate fallback patterns, returning empty patterns array"
                        )
                        patterns_result["patterns"] = []

                # If we have patterns but no themes, we'll continue with empty themes
                if not (has_basic_themes or has_enhanced_themes):
                    logger.warning(
                        "No themes found, but patterns are available. Continuing with empty themes."
                    )
                    # Create empty themes array
                    themes_result["themes"] = []

                # If enhanced themes succeeded but basic themes failed, use enhanced themes as basic themes
                if has_enhanced_themes and not has_basic_themes:
                    logger.info("Using enhanced themes as fallback for basic themes")
                    # Copy enhanced themes to basic themes
                    if "enhanced_themes" in enhanced_themes_result:
                        themes_result["themes"] = enhanced_themes_result[
                            "enhanced_themes"
                        ]
                    elif "themes" in enhanced_themes_result:
                        themes_result["themes"] = enhanced_themes_result["themes"]
            except Exception as e:
                logger.error(f"Error checking analysis completeness: {str(e)}")
                # Continue processing instead of returning an error
                # This allows the pipeline to proceed even if there's an error in the completeness check
                logger.info("Continuing despite error in completeness check")

            # ========================================================================
            # PERSONA GENERATION - Generate personas BEFORE insights so insights can
            # reference them. This enables cross-referencing between insights and personas.
            # ========================================================================
            logger.info("👥 [PIPELINE] Starting persona generation (before insights)")

            # Use stakeholder-aware text for persona generation if available
            # This enables proper per-stakeholder persona generation from simulation data
            persona_text = stakeholder_aware_text if stakeholder_aware_text else combined_text
            if stakeholder_aware_text:
                logger.info(
                    f"👥 [PIPELINE] Using stakeholder-aware text for persona generation ({len(stakeholder_aware_text)} chars)"
                )

            personas_result = await self._generate_personas(
                combined_text=persona_text,
                industry=industry,
                llm_service=llm_service,
                progress_callback=progress_callback,
            )

            logger.info(f"👥 [PIPELINE] Persona generation complete: {len(personas_result)} personas")
            if personas_result:
                persona_names = [p.get('name', 'Unnamed') for p in personas_result]
                logger.info(f"👥 [PIPELINE] Persona names: {persona_names}")

            # ========================================================================
            # INSIGHT GENERATION - Now with access to themes, patterns, AND personas
            # ========================================================================
            insight_start_time = asyncio.get_event_loop().time()

            # Update progress: Starting insight generation
            await update_progress(
                "INSIGHT_GENERATION", 0.7, "Starting insight generation"
            )

            # Get themes for insight generation - prefer themes_result but fall back to enhanced_themes
            themes_for_insights = themes_result.get("themes", [])
            if not themes_for_insights or len(themes_for_insights) == 0:
                # Fall back to enhanced themes if themes_result is empty
                if enhanced_themes_result and "enhanced_themes" in enhanced_themes_result:
                    themes_for_insights = enhanced_themes_result.get("enhanced_themes", [])
                    logger.info(f"Using enhanced themes for insight generation: {len(themes_for_insights)} themes")
                elif enhanced_themes_result and "themes" in enhanced_themes_result:
                    themes_for_insights = enhanced_themes_result.get("themes", [])
                    logger.info(f"Using themes from enhanced_themes_result for insight generation: {len(themes_for_insights)} themes")

            # Log what we're using for insight generation
            logger.info(f"[INSIGHT_PREP] themes_for_insights count: {len(themes_for_insights)}")
            if themes_for_insights:
                theme_names = [t.get('name', 'Unnamed') for t in themes_for_insights[:3]]
                logger.info(f"[INSIGHT_PREP] First theme names: {theme_names}")
                total_statements = sum(len(t.get('statements', [])) for t in themes_for_insights)
                logger.info(f"[INSIGHT_PREP] Total statements across themes: {total_statements}")

            # Create insight generation payload with ALL available context
            # Now includes personas for cross-referencing
            insight_payload = {
                "task": "insight_generation",
                "text": combined_text,
                "themes": themes_for_insights,
                "patterns": patterns_result.get("patterns", []),
                "sentiment": processed_sentiment,
                "personas": personas_result,  # NEW: Include personas for cross-referencing
            }

            # Add filename to payload if available
            if filename:
                insight_payload["filename"] = filename
                logger.info(
                    f"Adding filename to insight generation payload: {filename}"
                )

            logger.info(f"[INSIGHT_PREP] Insight payload includes {len(personas_result)} personas for cross-referencing")

            insights_result = await llm_service.analyze(insight_payload)

            # Update progress: Insight generation completed
            await update_progress(
                "INSIGHT_GENERATION", 0.8, "Insight generation completed"
            )

            insight_duration = asyncio.get_event_loop().time() - insight_start_time
            logger.info(
                f"Insight generation completed in {insight_duration:.2f} seconds"
            )

            total_duration = asyncio.get_event_loop().time() - start_time
            logger.info(f"Total analysis completed in {total_duration:.2f} seconds")

            # Solution 4: Ensure consistent result structure

            # First, ensure enhanced_themes is always populated with the best available themes
            enhanced_themes = []

            # Get enhanced themes from the result if available
            if enhanced_themes_result:
                enhanced_themes = enhanced_themes_result.get("enhanced_themes", [])

                # If enhanced_themes is empty but themes is available, use that
                if not enhanced_themes and "themes" in enhanced_themes_result:
                    enhanced_themes = enhanced_themes_result.get("themes", [])
                    logger.info(
                        "Using themes from enhanced_themes_result as enhanced_themes"
                    )

            # If enhanced_themes is still empty, create from basic themes
            if not enhanced_themes:
                logger.info(
                    "Enhanced themes still empty, using basic themes as enhanced themes"
                )
                basic_themes = themes_result.get("themes", [])

                # Convert basic themes to enhanced themes
                for theme in basic_themes:
                    enhanced_theme = copy.deepcopy(theme)
                    enhanced_theme["process"] = "enhanced"
                    enhanced_themes.append(enhanced_theme)

                logger.info(
                    f"Created {len(enhanced_themes)} enhanced themes from basic themes"
                )

            # If we still have no enhanced themes, just return an empty list
            if not enhanced_themes:
                logger.warning(
                    "No themes available at all after analysis; returning empty enhanced_themes list"
                )
                enhanced_themes = []

            # Enrich themes with statements_detailed by attributing quotes to source interviews
            try:
                def _normalize_txt(s: str) -> str:
                    try:
                        return " ".join((s or "").lower().strip().split())
                    except Exception:
                        return s or ""

                # Build simple per-interview text index with synthetic doc_ids when missing
                doc_index: list[tuple[str, str]] = []  # (document_id, text_lower)
                if isinstance(data, dict) and isinstance(data.get("interviews"), list):
                    for i, iv in enumerate(data["interviews"]):
                        try:
                            did = (
                                iv.get("document_id")
                                or iv.get("id")
                                or f"interview_{i+1}"
                            )
                            parts: list[str] = []
                            if isinstance(iv.get("responses"), list):
                                for r in iv["responses"]:
                                    ans = r.get("answer") or r.get("response") or ""
                                    if isinstance(ans, str) and ans.strip():
                                        parts.append(ans)
                            elif isinstance(iv.get("text"), str):
                                parts.append(iv["text"])
                            if parts:
                                doc_index.append((str(did), _normalize_txt("\n\n".join(parts))))
                        except Exception:
                            continue
                else:
                    # Single-document fallback using combined_text
                    doc_index.append(("original_text", _normalize_txt(combined_text)))

                def _infer_doc_id_for_quote(q: str) -> str:
                    qn = _normalize_txt(q)
                    if not qn:
                        return "original_text"
                    for did, txt in doc_index:
                        # Simple containment match; could be extended with fuzzy matching
                        if qn in txt or (len(qn) > 30 and qn[:30] in txt):
                            return did
                    return "original_text"

                # Apply attribution to enhanced themes
                for t in enhanced_themes:
                    if not isinstance(t, dict):
                        continue
                    stmts = (
                        t.get("statements")
                        or t.get("examples")
                        or t.get("example_quotes")
                        or t.get("evidence")
                    )
                    if not isinstance(stmts, list) or not stmts:
                        continue
                    detailed = []
                    for s in stmts:
                        if isinstance(s, dict):
                            q = s.get("quote") or s.get("text")
                        else:
                            q = s
                        if not isinstance(q, str) or not q.strip():
                            continue
                        did = _infer_doc_id_for_quote(q)
                        detailed.append({"quote": q, "document_id": did})
                    if detailed:
                        t["statements_detailed"] = detailed
            except Exception as _e:
                logger.warning(f"[THEME_DOC_ATTR] Failed to attribute theme statements to documents: {_e}")

            # Combine results with enhanced themes as the primary themes
            # NOTE: personas_result was generated BEFORE insights, so insights can cross-reference them
            results = {
                "themes": enhanced_themes,  # Use enhanced themes as the primary themes
                "enhanced_themes": enhanced_themes,  # Also include enhanced_themes for backward compatibility
                "patterns": patterns_result.get("patterns", []),
                "sentiment": processed_sentiment,
                "insights": insights_result.get("insights", []),
                "personas": personas_result,  # Include personas generated earlier in the pipeline
                "validation": {"valid": True, "confidence": 0.9, "details": None},
                "original_text": combined_text,  # Store original text for later use
                "industry": industry,  # Add detected industry to the result
            }

            # Add sentiment overview if available (for disabled sentiment analysis)
            if sentiment_overview:
                results["sentimentOverview"] = sentiment_overview

            logger.info(
                f"📊 [PIPELINE_DEBUG] Final results contain {len(results['themes'])} themes and {len(results['patterns'])} patterns"
            )
            logger.info(
                f"👥 [PIPELINE_DEBUG] Final results contain {len(results.get('personas', []))} personas"
            )
            logger.info(
                f"🎯 [PIPELINE_DEBUG] Final results contain {len(results.get('enhanced_themes', []))} enhanced themes"
            )
            logger.info(
                f"💡 [PIPELINE_DEBUG] Final results contain {len(results.get('insights', []))} insights"
            )

            # Add metadata about the theme processing
            results["metadata"] = {
                "theme_processing": {
                    "source": "enhanced",
                    "count": len(results["themes"]),
                    "has_enhanced_themes": len(enhanced_themes) > 0,
                }
            }

            # Call extract_insights to generate personas and additional insights
            logger.info(
                "Calling extract_insights to generate personas and additional insights"
            )
            try:
                # Pass progress_callback in config if available
                extract_config = config.copy() if config else {}
                if progress_callback:
                    extract_config["progress_callback"] = progress_callback

                results = await self.extract_insights(
                    results, llm_service, extract_config
                )
                logger.info("Successfully completed extract_insights processing")
            except Exception as e:
                logger.error(f"Error in extract_insights: {str(e)}")
                # Continue with results even if extract_insights fails
                # Initialize empty personas if not already present
                if "personas" not in results:
                    results["personas"] = []

            return results

        except Exception as e:
            logger.error(f"Error processing interview data: {str(e)}")
            raise

    def _detect_stakeholder_structure(self, raw_text: str) -> Optional[Dict[str, Any]]:
        """
        Detect if the raw text contains stakeholder-segmented interview structure.

        Args:
            raw_text: Raw interview text to analyze

        Returns:
            Dictionary of stakeholder segments if detected, None otherwise
        """
        try:
            # Import the stakeholder-aware transcript processor
            from backend.services.processing.pipeline.stakeholder_aware_transcript_processor import (
                StakeholderAwareTranscriptProcessor,
            )

            # Create a temporary processor instance
            processor = StakeholderAwareTranscriptProcessor()

            # Try to parse stakeholder sections
            stakeholder_segments = processor._parse_stakeholder_sections(raw_text)

            if stakeholder_segments and len(stakeholder_segments) > 0:
                logger.info(
                    f"[STAKEHOLDER_DETECTION] Found {len(stakeholder_segments)} stakeholder categories"
                )

                # Convert to the format expected by persona formation service
                formatted_segments = {}
                for category, interviews in stakeholder_segments.items():
                    # Create mock segments for each interview
                    segments = []
                    for i, interview_text in enumerate(interviews):
                        segments.append(
                            {
                                "text": interview_text,
                                "speaker": f"Interviewee_{i+1}",
                                "role": "Interviewee",
                                "stakeholder_category": category,
                            }
                        )

                    formatted_segments[category] = {
                        "segments": segments,
                        "interview_count": len(interviews),
                        "content_info": {"type": "stakeholder_interview"},
                    }

                return formatted_segments
            else:
                logger.info("[STAKEHOLDER_DETECTION] No stakeholder structure detected")
                return None

        except Exception as e:
            logger.error(
                f"[STAKEHOLDER_DETECTION] Error detecting stakeholder structure: {str(e)}"
            )
            return None

    async def validate_results(self, results: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """Validate analysis results to ensure they contain required fields."""
        return await validate_results_helper(results)

    async def extract_insights(
        self, results: Dict[str, Any], llm_service: ILLMService, config=None
    ) -> Dict[str, Any]:
        """Extract additional insights from analysis results"""
        if config is None:
            config = {}

        # Extract progress callback if provided
        progress_callback = config.get("progress_callback")

        # Helper function to update progress
        async def update_progress(stage, progress, message):
            if progress_callback:
                await progress_callback(stage, progress, message)
            logger.info(f"Progress update: {stage} - {progress:.2f} - {message}")

        try:
            # Initial progress update
            await update_progress(
                "INSIGHT_GENERATION", 0.80, "Starting insight generation"
            )

            # Get original text and extracted insights
            texts = []

            # Include original text if available
            if "original_text" in results:
                texts.append(results["original_text"])

            # Add supporting evidence from themes and patterns
            for theme in results.get("themes", []):
                texts.extend(theme.get("statements", []))
            for pattern in results.get("patterns", []):
                texts.extend(pattern.get("evidence", []))

            # If no texts available, raise error
            if not texts:
                logger.error("No text content available for insight extraction")
                raise ValueError("No text content available for insight extraction")

            combined_text = "\n\n".join(filter(None, texts))

            # Update progress before insight generation
            await update_progress(
                "INSIGHT_GENERATION", 0.82, "Analyzing themes and patterns for insights"
            )

            # Check if we already have insights
            if not results.get("insights") or len(results.get("insights", [])) == 0:
                # Generate deeper insights only if we don't already have them
                insights_result = await llm_service.analyze(
                    {
                        "task": "insight_generation",
                        "text": combined_text,
                        "themes": results.get("themes", []),
                        "patterns": results.get("patterns", []),
                        "sentiment": results.get("sentiment", {}),
                        "existing_insights": [],
                    }
                )

                # Set results with new insights (don't extend to avoid duplicates)
                results["insights"] = insights_result.get("insights", [])
                logger.info(f"Generated {len(results['insights'])} new insights")

                # Update progress after insight generation
                await update_progress(
                    "INSIGHT_GENERATION",
                    0.85,
                    f"Generated {len(results['insights'])} insights",
                )

            # Add metadata
            if "insights_result" in locals():
                # If we generated new insights, use their metadata
                results["metadata"] = {
                    "analysis_quality": insights_result.get("metadata", {}).get(
                        "quality_score", 0
                    ),
                    "confidence_scores": insights_result.get("metadata", {}).get(
                        "confidence_scores", {}
                    ),
                    "processing_stats": insights_result.get("metadata", {}).get(
                        "processing_stats", {}
                    ),
                }
            else:
                # Otherwise, create default metadata
                results["metadata"] = {
                    "analysis_quality": 0.7,  # Default quality score
                    "confidence_scores": {},
                    "processing_stats": {},
                }

            # Update progress before persona generation
            await update_progress(
                "PERSONA_FORMATION", 0.9, "Starting persona formation"
            )

            # UNIFIED PERSONA FIX: Check if enhanced personas already exist
            existing_personas = results.get("personas", [])
            if existing_personas and len(existing_personas) > 0:
                # Check if personas have stakeholder intelligence features (enhanced personas)
                has_stakeholder_features = any(
                    p.get("stakeholder_intelligence") is not None
                    for p in existing_personas
                )

                if has_stakeholder_features:
                    logger.info(
                        f"[UNIFIED_PERSONA_FIX] Skipping duplicate persona generation - {len(existing_personas)} enhanced personas already exist"
                    )
                    logger.info(
                        f"[UNIFIED_PERSONA_FIX] Enhanced persona names: {[p.get('name', 'Unnamed') for p in existing_personas]}"
                    )
                else:
                    logger.info(
                        f"[UNIFIED_PERSONA_FIX] Skipping duplicate persona generation - {len(existing_personas)} personas already exist"
                    )
                    logger.info(
                        f"[UNIFIED_PERSONA_FIX] Existing persona names: {[p.get('name', 'Unnamed') for p in existing_personas]}"
                    )

                # Update progress and skip persona generation
                await update_progress(
                    "PERSONA_FORMATION",
                    0.95,
                    f"Using existing {len(existing_personas)} personas with stakeholder intelligence",
                )
            else:
                # Generate personas from the text
                logger.info("Generating personas from interview text")

                try:
                    # Generate personas using PydanticAI (migrated from Instructor)
                    logger.info("Generating personas using PydanticAI")

                    # Get the raw text from the original source if available
                    raw_text = results.get("original_text", combined_text)

                    # Call PydanticAI for persona formation (migrated from Instructor)
                    logger.info(
                        f"Calling PydanticAI for persona formation with {len(raw_text[:100])}... chars"
                    )

                    # Import the enhanced persona formation service
                    from backend.services.processing.persona_formation_service import (
                        PersonaFormationService,
                    )

                    # Create a minimal config for the persona service
                    class MinimalConfig:
                        def __init__(self):
                            self.validation = type(
                                "obj", (object,), {"min_confidence": 0.4}
                            )
                            self.llm = type("obj", (object,), {"api_key": None})

                    # Create persona service with proper constructor
                    config = MinimalConfig()
                    persona_service = PersonaFormationService(config, llm_service)

                    # STAKEHOLDER-AWARE PERSONA FORMATION: Check if content has stakeholder structure
                    logger.info(
                        "👥 [PIPELINE_DEBUG] [PERSONA_PIPELINE] Checking for stakeholder-aware content structure"
                    )

                    # Try to detect stakeholder structure in the raw text
                    stakeholder_segments = self._detect_stakeholder_structure(raw_text)
                    logger.info(
                        f"👥 [PIPELINE_DEBUG] Stakeholder detection result: {stakeholder_segments is not None}"
                    )

                    # Check for ENABLE_MULTI_STAKEHOLDER env var, or auto-detect simulation format
                    is_simulation_format = bool(
                        re.search(r"--- INTERVIEW \d+ ---\s*\nStakeholder:", raw_text)
                    )
                    enable_ms = (
                        os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true"
                        or is_simulation_format
                    )
                    if is_simulation_format:
                        logger.info(
                            "👥 [PIPELINE_DEBUG] Auto-enabled multi-stakeholder for simulation format data"
                        )
                    if stakeholder_segments and enable_ms:
                        logger.info(
                            f"👥 [PIPELINE_DEBUG] [STAKEHOLDER_PERSONA] Detected {len(stakeholder_segments)} stakeholder categories"
                        )
                        logger.info(
                            f"👥 [PIPELINE_DEBUG] [STAKEHOLDER_PERSONA] Categories: {list(stakeholder_segments.keys())}"
                        )

                        # Use stakeholder-aware persona formation
                        logger.info(
                            "👥 [PIPELINE_DEBUG] Starting stakeholder-aware persona formation..."
                        )
                        personas_list = (
                            await persona_service.form_personas_by_stakeholder(
                                stakeholder_segments,
                                context={
                                    "industry": results.get("industry", "general"),
                                    "original_text": raw_text,
                                    "processing_method": "stakeholder_aware",
                                },
                            )
                        )
                        logger.info(
                            f"👥 [PIPELINE_DEBUG] [STAKEHOLDER_PERSONA] Generated {len(personas_list)} stakeholder-aware personas"
                        )
                    else:
                        # ENHANCED PERSONA FORMATION: Use improved pipeline with built-in quality validation
                        logger.info(
                            "👥 [PIPELINE_DEBUG] [PERSONA_PIPELINE] No stakeholder structure detected, using standard persona formation"
                        )

                        # Use the full persona service with transcript structuring
                        # Now that timeout fixes are in place, this should work reliably
                        logger.info(
                            "👥 [PIPELINE_DEBUG] Starting standard persona formation..."
                        )
                        personas_list = (
                            await persona_service.generate_persona_from_text(
                                text=raw_text,
                                context={
                                    "industry": results.get("industry", "general"),
                                    "original_text": raw_text,
                                },
                            )
                        )
                        logger.info(
                            f"👥 [PIPELINE_DEBUG] Standard persona formation completed: {len(personas_list)} personas"
                        )

                    # FIX 4: Use ALL personas from the list, not just the first one
                    # PersonaFormationService.generate_persona_from_text returns a list of persona dicts
                    if personas_list and isinstance(personas_list, list):
                        personas = personas_list  # Use the entire list of personas
                        logger.info(
                            f"Successfully generated {len(personas)} personas using PydanticAI: {[p.get('name', 'Unnamed') for p in personas]}"
                        )
                    else:
                        logger.warning(
                            f"Unexpected personas_list result: {type(personas_list)} with value {personas_list}"
                        )
                        personas = []

                    # Validate personas
                    if personas and isinstance(personas, list) and len(personas) > 0:
                        # Log success and add personas to results
                        logger.info(f"Successfully generated {len(personas)} personas")

                        # Check structure of first persona
                        first_persona = personas[0]
                        if isinstance(first_persona, dict):
                            logger.info(
                                f"First persona keys: {list(first_persona.keys())}"
                            )

                            # Make sure it has the required fields
                            # Legacy required fields removed; modern personas only require name/description
                            required_fields = [
                                "name",
                                "description",
                            ]
                            missing_fields = [
                                field
                                for field in required_fields
                                if field not in first_persona
                            ]
                            if missing_fields:
                                logger.warning(
                                    f"Persona missing required fields: {missing_fields}"
                                )
                                # Fill in missing fields
                                for field in missing_fields:
                                    first_persona[field] = {
                                        "value": f"Unknown {field.replace('_', ' ')}",
                                        "confidence": 0.5,
                                        "evidence": [
                                            "Generated as fallback due to missing field"
                                        ],
                                    }
                        else:
                            logger.warning(
                                f"First persona is not a dictionary: {type(first_persona)}"
                            )
                    else:
                        logger.warning("Generated personas list is empty or invalid")
                        personas = []

                    # Add personas to results
                    results["personas"] = personas
                    logger.info(f"Added {len(personas)} personas to analysis results")

                    # Update progress after persona processing
                    await update_progress(
                        "PERSONA_FORMATION", 0.95, f"Generated {len(personas)} personas"
                    )
                except Exception as persona_err:
                    # Log the error but continue processing
                    logger.error(f"Error generating personas: {str(persona_err)}")

                    # Add empty personas list to results
                    results["personas"] = []

                    # Log a message about trying again with a different approach
                    logger.info(
                        "Consider trying persona generation with a different prompt or more context"
                    )

                    # Update progress with error information
                    await update_progress(
                        "PERSONA_FORMATION",
                        0.95,
                        "Error generating personas, continuing with empty personas",
                    )

            # Final progress update
            await update_progress("COMPLETION", 1.0, "Analysis completed successfully")

            return results

        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
            # Update progress with error information
            if progress_callback:
                await update_progress(
                    "INSIGHT_GENERATION",
                    0.95,
                    f"Error during insight extraction: {str(e)}",
                )
            # Return partial results if available
            return results if isinstance(results, dict) else {}

    async def _generate_personas(
        self,
        combined_text: str,
        industry: str,
        llm_service,
        progress_callback=None,
    ) -> List[Dict[str, Any]]:
        """
        Generate personas from interview text.

        This is extracted as a separate method to allow personas to be generated
        BEFORE insight generation, so insights can reference personas.

        Args:
            combined_text: The combined interview text
            industry: Detected industry
            llm_service: LLM service for generation
            progress_callback: Optional progress callback

        Returns:
            List of persona dictionaries
        """
        # Helper for progress updates
        async def update_progress(stage: str, progress: float, message: str):
            if progress_callback:
                try:
                    await progress_callback(stage, progress, message)
                except Exception as e:
                    logger.warning(f"Error updating progress: {str(e)}")

        try:
            await update_progress(
                "PERSONA_FORMATION", 0.65, "Starting persona formation"
            )

            logger.info("👥 [PERSONA_GEN] Starting persona generation")

            # Import the enhanced persona formation service
            from backend.services.processing.persona_formation_service import (
                PersonaFormationService,
            )

            # Create a minimal config for the persona service
            class MinimalConfig:
                def __init__(self):
                    self.validation = type(
                        "obj", (object,), {"min_confidence": 0.4}
                    )
                    self.llm = type("obj", (object,), {"api_key": None})

            # Create persona service with proper constructor
            config = MinimalConfig()
            persona_service = PersonaFormationService(config, llm_service)

            # STAKEHOLDER-AWARE PERSONA FORMATION: Check if content has stakeholder structure
            logger.info(
                "👥 [PERSONA_GEN] Checking for stakeholder-aware content structure"
            )

            # Try to detect stakeholder structure in the raw text
            stakeholder_segments = self._detect_stakeholder_structure(combined_text)
            logger.info(
                f"👥 [PERSONA_GEN] Stakeholder detection result: {stakeholder_segments is not None}"
            )

            # Check for ENABLE_MULTI_STAKEHOLDER env var, or auto-detect simulation format
            # The simulation format uses "--- INTERVIEW N ---\nStakeholder:" pattern
            is_simulation_format = bool(
                re.search(r"--- INTERVIEW \d+ ---\s*\nStakeholder:", combined_text)
            )
            enable_ms = (
                os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true"
                or is_simulation_format
            )
            if is_simulation_format:
                logger.info(
                    "👥 [PERSONA_GEN] Auto-enabled multi-stakeholder for simulation format data"
                )

            if stakeholder_segments and enable_ms:
                logger.info(
                    f"👥 [PERSONA_GEN] Detected {len(stakeholder_segments)} stakeholder categories"
                )
                logger.info(
                    f"👥 [PERSONA_GEN] Categories: {list(stakeholder_segments.keys())}"
                )

                # Use stakeholder-aware persona formation
                logger.info(
                    "👥 [PERSONA_GEN] Starting stakeholder-aware persona formation..."
                )
                personas_list = (
                    await persona_service.form_personas_by_stakeholder(
                        stakeholder_segments,
                        context={
                            "industry": industry,
                            "original_text": combined_text,
                            "processing_method": "stakeholder_aware",
                        },
                    )
                )
                logger.info(
                    f"👥 [PERSONA_GEN] Generated {len(personas_list)} stakeholder-aware personas"
                )
            else:
                # ENHANCED PERSONA FORMATION: Use improved pipeline with built-in quality validation
                logger.info(
                    "👥 [PERSONA_GEN] No stakeholder structure detected, using standard persona formation"
                )

                # Use the full persona service with transcript structuring
                logger.info(
                    "👥 [PERSONA_GEN] Starting standard persona formation..."
                )
                personas_list = (
                    await persona_service.generate_persona_from_text(
                        text=combined_text,
                        context={
                            "industry": industry,
                            "original_text": combined_text,
                        },
                    )
                )
                logger.info(
                    f"👥 [PERSONA_GEN] Standard persona formation completed: {len(personas_list)} personas"
                )

            # Process the result
            if personas_list and isinstance(personas_list, list):
                personas = personas_list
                logger.info(
                    f"👥 [PERSONA_GEN] Successfully generated {len(personas)} personas: {[p.get('name', 'Unnamed') for p in personas]}"
                )
            else:
                logger.warning(
                    f"👥 [PERSONA_GEN] Unexpected personas_list result: {type(personas_list)}"
                )
                personas = []

            # Validate personas
            if personas and isinstance(personas, list) and len(personas) > 0:
                logger.info(f"👥 [PERSONA_GEN] Validating {len(personas)} personas")

                # Check structure of first persona
                first_persona = personas[0]
                if isinstance(first_persona, dict):
                    logger.info(
                        f"👥 [PERSONA_GEN] First persona keys: {list(first_persona.keys())}"
                    )

                    # Make sure it has the required fields
                    required_fields = ["name", "description"]
                    missing_fields = [
                        field
                        for field in required_fields
                        if field not in first_persona
                    ]
                    if missing_fields:
                        logger.warning(
                            f"👥 [PERSONA_GEN] Persona missing required fields: {missing_fields}"
                        )
                        # Fill in missing fields
                        for field in missing_fields:
                            first_persona[field] = {
                                "value": f"Unknown {field.replace('_', ' ')}",
                                "confidence": 0.5,
                                "evidence": [
                                    "Generated as fallback due to missing field"
                                ],
                            }
                else:
                    logger.warning(
                        f"👥 [PERSONA_GEN] First persona is not a dictionary: {type(first_persona)}"
                    )
            else:
                logger.warning("👥 [PERSONA_GEN] Generated personas list is empty or invalid")
                personas = []

            await update_progress(
                "PERSONA_FORMATION", 0.68, f"Generated {len(personas)} personas"
            )

            logger.info(f"👥 [PERSONA_GEN] Returning {len(personas)} personas")
            return personas

        except Exception as e:
            logger.error(f"👥 [PERSONA_GEN] Error generating personas: {str(e)}")
            await update_progress(
                "PERSONA_FORMATION",
                0.68,
                "Error generating personas, continuing with empty list",
            )
            return []

    def _process_sentiment_results(
        self, sentiment_result: Dict[str, Any]
    ) -> Dict[str, List[str]]:
        """Process sentiment results to extract supporting statements."""
        return process_sentiment_results(sentiment_result)

    async def _generate_fallback_patterns(
        self, text: str, themes: list, llm_service
    ) -> list:
        """
        Generate fallback patterns from themes when direct pattern generation fails.

        Args:
            text: The interview text
            themes: List of themes to convert to patterns
            llm_service: LLM service to use for pattern enhancement

        Returns:
            List of generated patterns
        """
        try:
            logger.info(f"Generating fallback patterns from {len(themes)} themes")

            # If no themes, return empty list
            if not themes:
                logger.warning("No themes available to generate fallback patterns")
                return []

            # Create patterns from themes
            patterns = []

            for theme in themes:
                # Skip themes without names or definitions
                if not theme.get("name") or not theme.get("definition"):
                    continue

                # Create a pattern from the theme
                pattern = {
                    "name": f"Pattern: {theme.get('name')}",
                    "description": theme.get("definition"),
                    "category": self._determine_pattern_category(
                        theme.get("name", ""),
                        theme.get("definition", ""),
                        theme.get("statements", []),
                    ),
                    "frequency": theme.get("frequency", 0.7),
                    "impact": "This pattern affects how users approach their work and may influence tool adoption.",
                    "suggested_actions": "Consider addressing this pattern in the design process.",
                    "evidence": theme.get("statements", []),
                }

                # Add the pattern to the list
                patterns.append(pattern)

            logger.info(f"Generated {len(patterns)} fallback patterns from themes")

            # If we have patterns, try to enhance them with the LLM
            if patterns:
                try:
                    # Call LLM to enhance patterns
                    enhanced_patterns_result = await llm_service.analyze(
                        {
                            "task": "pattern_enhancement",
                            "text": text[:5000],  # Limit text size
                            "patterns": patterns,
                        }
                    )

                    # Extract enhanced patterns from result
                    enhanced_patterns = enhanced_patterns_result.get("patterns", [])

                    # If we got enhanced patterns, use them
                    if enhanced_patterns and len(enhanced_patterns) > 0:
                        logger.info(
                            f"Successfully enhanced {len(enhanced_patterns)} patterns"
                        )
                        return enhanced_patterns
                except Exception as e:
                    logger.error(f"Error enhancing patterns: {str(e)}")
                    # Continue with original patterns

            return patterns
        except Exception as e:
            logger.error(f"Error generating fallback patterns: {str(e)}")
            return []

    async def _detect_industry(self, text: str, llm_service) -> str:
        """
        Detect industry from interview content.

        Args:
            text: The interview text
            llm_service: LLM service to use for detection

        Returns:
            Detected industry
        """
        try:
            # Define valid industries
            valid_industries = [
                "healthcare",
                "tech",
                "finance",
                "military",
                "education",
                "hospitality",
                "retail",
                "manufacturing",
                "legal",
                "insurance",
                "agriculture",
                "non_profit",
            ]

            # Create a more detailed prompt to detect the industry with structured output
            industry_detection_prompt = f"""
            You are an expert industry analyst. Analyze the following interview transcript and determine the most likely industry context.

            INTERVIEW SAMPLE:
            {text[:5000]}...

            TASK:
            1. Identify the primary industry that best matches the context of this interview.
            2. Choose from these specific industries: healthcare, tech, finance, military, education, hospitality, retail, manufacturing, legal, insurance, agriculture, non_profit.
            3. Provide a brief explanation of why you selected this industry (2-3 sentences).
            4. List 3-5 key terms or phrases from the text that indicate this industry.

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
              "industry": "selected_industry_name",
              "explanation": "Brief explanation of why this industry was selected",
              "key_indicators": ["term1", "term2", "term3"],
              "confidence": 0.8  // A value between 0.0 and 1.0 indicating your confidence in this classification
            }}
            """

            # Call LLM to detect industry - use JSON format for structured response
            response = await llm_service.analyze(
                {
                    "task": "text_generation",
                    "text": industry_detection_prompt,
                    "enforce_json": True,  # Changed to True for structured output
                    "temperature": 0.0,  # Use deterministic output
                    "response_mime_type": "application/json",  # Explicitly request JSON
                }
            )

            # Extract industry from response
            industry = "general"  # Default value

            # Log the raw response for debugging
            logger.info(f"Industry detection raw response: {response}")

            # Process the response based on its type
            if isinstance(response, dict):
                if "industry" in response:
                    # Direct JSON response
                    detected_industry = response["industry"].strip().lower()
                    explanation = response.get("explanation", "No explanation provided")
                    confidence = response.get("confidence", 0.5)

                    logger.info(
                        f"Detected industry: {detected_industry} with confidence: {confidence}"
                    )
                    logger.info(f"Explanation: {explanation}")

                    # Validate against our list of valid industries
                    if detected_industry in valid_industries:
                        return detected_industry

                    # Try partial matching
                    for valid_industry in valid_industries:
                        if valid_industry in detected_industry:
                            logger.info(
                                f"Matched partial industry: {valid_industry} from '{detected_industry}'"
                            )
                            return valid_industry
                elif "text" in response:
                    # Text response that might contain JSON or plain text
                    try:
                        # Try to parse as JSON
                        text_content = response["text"].strip()
                        if text_content.startswith("{") and text_content.endswith("}"):
                            json_data = json.loads(text_content)
                            if "industry" in json_data:
                                detected_industry = (
                                    json_data["industry"].strip().lower()
                                )
                                if detected_industry in valid_industries:
                                    return detected_industry
                    except json.JSONDecodeError:
                        # Not valid JSON, treat as plain text
                        text_content = response["text"].strip().lower()
                        for valid_industry in valid_industries:
                            if valid_industry in text_content:
                                return valid_industry
            elif isinstance(response, str):
                # Plain text response
                text_content = response.strip().lower()

                # Try to parse as JSON if it looks like JSON
                if text_content.startswith("{") and text_content.endswith("}"):
                    try:
                        json_data = json.loads(text_content)
                        if "industry" in json_data:
                            detected_industry = json_data["industry"].strip().lower()
                            if detected_industry in valid_industries:
                                return detected_industry
                    except json.JSONDecodeError:
                        pass

                # Otherwise, look for industry names in the text
                for valid_industry in valid_industries:
                    if valid_industry in text_content:
                        return valid_industry

            # Default to "general" if no specific industry detected
            logger.info(f"No specific industry detected, using 'general'")
            return "general"
        except Exception as e:
            logger.error(f"Error detecting industry: {str(e)}")
            return "general"

    def _determine_pattern_category(
        self, name: str, description: str, statements: List[str]
    ) -> str:
        """Determine the appropriate category for a pattern based on its content."""
        return determine_pattern_category(name, description, statements)

    def _generate_detailed_description(
        self, name: str, description: str, statements: List[str]
    ) -> str:
        """Generate a detailed behavioral description for a pattern."""
        return generate_detailed_description(name, description, statements)

    def _generate_specific_impact(
        self, name: str, description: str, sentiment: float, statements: List[str]
    ) -> str:
        """Generate a specific impact statement for a pattern."""
        return generate_specific_impact(name, description, sentiment, statements)

    def _generate_actionable_recommendations(
        self, name: str, description: str, sentiment: float
    ) -> List[str]:
        """Generate specific, actionable recommendations based on the pattern."""
        return generate_actionable_recommendations(name, description, sentiment)

    async def _create_minimal_sentiment_result(self) -> Dict[str, Any]:
        """Create a minimal sentiment result for schema compatibility."""
        return await create_minimal_sentiment_result()
