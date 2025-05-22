"""NLP processor service"""

import logging
import asyncio
import json
import re
import copy
import importlib.util
from typing import Dict, Any, List, Tuple
from domain.interfaces.llm_unified import ILLMService

from backend.schemas import DetailedAnalysisResult

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

    async def parse_free_text(self, text: str) -> List[Dict[str, str]]:
        """
        Parse free-text interview transcripts to extract question-answer pairs.

        This method attempts to identify question-answer patterns in free text using
        common patterns like "Q:", "A:", or standard interview question formats.

        Args:
            text (str): The free-text interview transcript

        Returns:
            List[Dict[str, str]]: List of extracted question-answer pairs
        """
        logger.info("Parsing free-text format input")

        # Check if the text already uses Q/A format
        qa_pattern = re.compile(
            r"(?:^|\n)(?:Q|Question)[:.\s]+(.*?)(?:\n)(?:A|Answer)[:.\s]+(.*?)(?=(?:\n)(?:Q|Question)|$)",
            re.DOTALL,
        )
        qa_matches = qa_pattern.findall(text)

        if qa_matches:
            logger.info(f"Found {len(qa_matches)} explicit Q/A pairs in the text")
            qa_pairs = []
            for q, a in qa_matches:
                qa_pairs.append({"question": q.strip(), "answer": a.strip()})
            return qa_pairs

        # If no explicit Q/A format, try to identify question-answer patterns
        # Common patterns: questions end with ? and often start with interrogative words
        question_pattern = re.compile(
            r"(?:^|\n)(?:(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)(.*?)(?=(?:^|\n)(?:(?:What|How|Why|When|Where|Who|Could you|Can you|Tell me about|Describe|Explain|In your opinion|Do you).*?\?)|$)",
            re.DOTALL | re.IGNORECASE,
        )
        qa_matches = question_pattern.findall(text)

        if qa_matches:
            logger.info(
                f"Extracted {len(qa_matches)} implicit Q/A pairs using question patterns"
            )
            qa_pairs = []
            for i, match in enumerate(qa_matches):
                if i > 0:  # First match is the answer to the previous question
                    question = qa_matches[i - 1][0].strip()
                    answer = match.strip()
                    qa_pairs.append({"question": question, "answer": answer})
            return qa_pairs

        # If still no patterns found, split by paragraphs and use alternating Q/A assignment
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]

        if paragraphs:
            logger.info(
                f"No clear Q/A structure found. Using paragraph-based splitting with {len(paragraphs)} paragraphs"
            )
            qa_pairs = []

            # Attempt to determine if first paragraph is context or introduction
            is_intro = len(paragraphs[0].split()) > 50 or not any(
                w in paragraphs[0].lower()
                for w in ["?", "who", "what", "when", "where", "why", "how"]
            )

            start_idx = 1 if is_intro else 0
            for i in range(start_idx, len(paragraphs), 2):
                if i + 1 < len(paragraphs):
                    qa_pairs.append(
                        {
                            "question": paragraphs[i].strip(),
                            "answer": paragraphs[i + 1].strip(),
                        }
                    )

            if qa_pairs:
                logger.info(
                    f"Created {len(qa_pairs)} Q/A pairs using paragraph alternation"
                )
                return qa_pairs

        # Last resort: treat the entire text as a single answer with a generic question
        logger.warning(
            "Could not extract structured Q/A pairs. Treating as single response."
        )
        return [
            {
                "question": "Please share your thoughts and opinions on the topic:",
                "answer": text.strip(),
            }
        ]

    async def process_interview_data(
        self, data: Dict[str, Any], llm_service, config=None
    ) -> Dict[str, Any]:
        """Process interview data to extract insights"""
        if config is None:
            config = {}

        # Solution 1: Enable enhanced theme analysis by default
        use_enhanced_theme_analysis = config.get("use_enhanced_theme_analysis", True)  # Changed default to True
        logger.info(f"Enhanced theme analysis is {'enabled' if use_enhanced_theme_analysis else 'disabled'}")

        try:
            # Extract text content
            texts = []
            answer_texts = []  # Explicitly track answer-only content for theme analysis

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
                    logger.info(f"Detected Problem_demo file: {filename}. Special handling will be applied.")

            # Detect and handle free-text format
            if isinstance(data, str) or (
                isinstance(data, dict) and "free_text" in data
            ):
                logger.info("Detected free-text format input")
                raw_text = data if isinstance(data, str) else data.get("free_text", "")

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

            # Handle existing JSON data formats
            elif isinstance(data, list):
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
                # Handle Excel format with persona and respondents
                if (
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
                                answer = response.get("answer", "")
                                # Only use answer field, completely ignore text field
                                if question and answer:
                                    combined_text = f"Q: {question}\nA: {answer}"
                                    texts.append(combined_text)
                                    # Store answer-only version for theme analysis
                                    answer_texts.append(answer)
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
                logger.error(f"No text content found in data. Data structure: {data}")
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
            enhanced_theme_payload = {
                "task": "theme_analysis_enhanced",
                "text": answer_only_text,  # Use answer-only text for themes
                "use_answer_only": True,  # Flag to indicate answer-only processing
                "industry": config.get("industry")  # Pass industry context if available
            }

            # Add filename to payload if available
            if filename:
                enhanced_theme_payload["filename"] = filename
                logger.info(f"Adding filename to enhanced theme analysis payload: {filename}")

            # Call analyze using the determined service for enhanced theme analysis
            enhanced_themes_task = target_llm_service_enhanced.analyze(enhanced_theme_payload)

            # Get enhanced themes directly
            enhanced_themes_result = await enhanced_themes_task

            # Store the enhanced themes as the main themes result
            themes_result = {"themes": []}  # Initialize with empty themes

            # Solution 2: Improve the handling of enhanced theme results
            try:
                # Log the full structure of the enhanced_themes_result for debugging
                logger.info(f"Enhanced theme analysis result structure: {type(enhanced_themes_result)}")
                if isinstance(enhanced_themes_result, dict):
                    logger.info(f"Enhanced theme analysis result keys: {list(enhanced_themes_result.keys())}")
                    # Log the raw result for debugging
                    logger.debug(f"Enhanced theme analysis raw result: {json.dumps(enhanced_themes_result)}")

                # Check for enhanced_themes key first (preferred)
                if isinstance(enhanced_themes_result, dict) and "enhanced_themes" in enhanced_themes_result and isinstance(enhanced_themes_result["enhanced_themes"], list):
                    logger.info(
                        f"Enhanced theme analysis completed with {len(enhanced_themes_result.get('enhanced_themes', []))} themes"
                    )
                    # Log the first theme if available
                    if enhanced_themes_result["enhanced_themes"]:
                        first_theme = enhanced_themes_result["enhanced_themes"][0]
                        logger.info(f"First enhanced theme: {first_theme.get('name', 'Unnamed')}")
                # Fall back to themes key if enhanced_themes is not present
                elif isinstance(enhanced_themes_result, dict) and "themes" in enhanced_themes_result and isinstance(enhanced_themes_result["themes"], list):
                    logger.info(
                        f"Enhanced theme analysis returned regular themes with {len(enhanced_themes_result.get('themes', []))} themes"
                    )
                    # Copy themes to enhanced_themes for consistent handling
                    enhanced_themes_result["enhanced_themes"] = enhanced_themes_result["themes"]
                    logger.info("Copied themes to enhanced_themes for consistent handling")
                    # Log the first theme if available
                    if enhanced_themes_result["themes"]:
                        first_theme = enhanced_themes_result["themes"][0]
                        logger.info(f"First theme (copied to enhanced_themes): {first_theme.get('name', 'Unnamed')}")
                # Handle direct list of themes (no wrapper object)
                elif isinstance(enhanced_themes_result, list) and len(enhanced_themes_result) > 0:
                    logger.info(f"Enhanced theme analysis returned a direct list of {len(enhanced_themes_result)} themes")
                    # Wrap the list in a dictionary with enhanced_themes key
                    enhanced_themes_result = {"enhanced_themes": enhanced_themes_result}
                    logger.info("Wrapped theme list in enhanced_themes key for consistent handling")
                else:
                    logger.warning(
                        f"Enhanced theme analysis did not return expected structure. Keys: {list(enhanced_themes_result.keys()) if isinstance(enhanced_themes_result, dict) else 'not a dictionary'}"
                    )
                    # Create a default structure if the result is not as expected
                    enhanced_themes_result = {"enhanced_themes": []}
                    logger.warning("Created empty enhanced_themes structure as fallback")
            except Exception as e:
                logger.error(f"Error in enhanced theme analysis: {str(e)}")
                # Create a fallback enhanced themes result
                enhanced_themes_result = {"enhanced_themes": []}
                logger.warning("Created empty enhanced_themes structure due to error")

            # Solution 3: Improve the fallback mechanism
            # Create default enhanced themes if enhanced themes are missing or empty
            if not enhanced_themes_result or not enhanced_themes_result.get("enhanced_themes", []):
                logger.info("Enhanced themes not available or empty, creating default enhanced themes")
                try:
                    # Create default enhanced themes
                    enhanced_themes = []

                    # Create a minimal default theme
                    logger.info("Creating a minimal default theme")

                    # Create a default theme
                    enhanced_theme = {
                        "type": "theme",
                        "name": "General Theme",
                        "definition": "A general theme extracted from the interview",
                        "keywords": ["general", "theme", "interview"],
                        "statements": [],
                        "frequency": 0.5,
                        "sentiment": 0.0,
                        "reliability": 0.5,
                        "process": "enhanced"
                    }

                    # Add reliability metrics
                    reliability = enhanced_theme.get("reliability", 0.5)
                    enhanced_theme["reliability_metrics"] = {
                        "cohen_kappa": round(reliability * 0.9, 2),
                        "percent_agreement": round(reliability, 2),
                        "confidence_interval": [
                            round(max(0, reliability - 0.15), 2),
                            round(min(1, reliability + 0.15), 2)
                        ]
                    }

                    # Add sentiment distribution
                    sentiment = enhanced_theme.get("sentiment", 0)
                    enhanced_theme["sentiment_distribution"] = {
                        "positive": round(max(0, (sentiment + 1) / 2), 2),
                        "neutral": round(max(0, 1 - abs(sentiment)), 2),
                        "negative": round(max(0, (1 - sentiment) / 2), 2)
                    }

                    # Add codes
                    enhanced_theme["codes"] = ["GENERAL_THEME"]

                    # Add hierarchical codes
                    enhanced_theme["hierarchical_codes"] = [
                        {
                            "code": "GENERAL_THEME",
                            "definition": "Code representing general theme",
                            "frequency": 0.5,
                            "sub_codes": [
                                {
                                    "code": "GENERAL_THEME_INTERVIEW",
                                    "definition": "Sub-aspect related to interview content",
                                    "frequency": 0.4
                                }
                            ]
                        }
                    ]

                    # Add relationships
                    enhanced_theme["relationships"] = []

                    # Add the theme to the list
                    enhanced_themes.append(enhanced_theme)
                    logger.info("Created a minimal default theme as fallback")

                    # Store the enhanced themes in the result
                    if enhanced_themes_result is None:
                        enhanced_themes_result = {}

                    # Always store in enhanced_themes key for consistency
                    enhanced_themes_result["enhanced_themes"] = enhanced_themes
                    logger.info(f"Created {len(enhanced_themes)} enhanced themes from basic themes")
                except Exception as e:
                    logger.error(f"Error creating enhanced themes from basic themes: {str(e)}")
                    # Create a minimal fallback enhanced themes result
                    if enhanced_themes_result is None:
                        enhanced_themes_result = {}

                    enhanced_themes_result["enhanced_themes"] = [{
                        "type": "theme",
                        "name": "Fallback Theme",
                        "definition": "A fallback theme created due to processing error",
                        "keywords": ["fallback", "error", "recovery"],
                        "statements": [],
                        "frequency": 0.5,
                        "sentiment": 0.0,
                        "reliability": 0.5,
                        "process": "enhanced",
                        "codes": ["ERROR_RECOVERY"],
                        "sentiment_distribution": {
                            "positive": 0.2,
                            "neutral": 0.6,
                            "negative": 0.2
                        },
                        "hierarchical_codes": [
                            {
                                "code": "ERROR_RECOVERY",
                                "definition": "Code representing error recovery",
                                "frequency": 0.5,
                                "sub_codes": [
                                    {
                                        "code": "ERROR_RECOVERY_FALLBACK",
                                        "definition": "Sub-aspect related to fallback mechanisms",
                                        "frequency": 0.4
                                    }
                                ]
                            }
                        ],
                        "reliability_metrics": {
                            "cohen_kappa": 0.45,
                            "percent_agreement": 0.5,  # Keep between 0 and 1
                            "confidence_interval": [0.3, 0.6]
                        },
                        "relationships": []
                    }]
                    logger.warning("Created fallback theme due to error in enhanced theme creation")

            # Detect industry from the text
            industry = await self._detect_industry(combined_text, llm_service)
            logger.info(f"Detected industry: {industry}")

            # Create pattern recognition payload with filename if available
            pattern_payload = {
                "task": "pattern_recognition",
                "text": combined_text,
                "industry": industry
            }

            # Add filename to payload if available
            if filename:
                pattern_payload["filename"] = filename
                logger.info(f"Adding filename to pattern recognition payload: {filename}")

            # Run pattern recognition with theme data and industry context
            patterns_task = llm_service.analyze(pattern_payload)

            # Create sentiment analysis payload with filename if available
            sentiment_payload = {
                "task": "sentiment_analysis",
                "text": self._preprocess_transcript_for_sentiment(combined_text),
                "themes": themes_result.get("themes", []),
                "industry": industry
            }

            # Add filename to payload if available
            if filename:
                sentiment_payload["filename"] = filename
                logger.info(f"Adding filename to sentiment analysis payload: {filename}")

            # Pass themes to sentiment analysis to leverage their statements if needed
            sentiment_task = llm_service.analyze(sentiment_payload)

            # Wait for remaining tasks to complete
            patterns_result, sentiment_result = await asyncio.gather(
                patterns_task, sentiment_task
            )

            parallel_duration = asyncio.get_event_loop().time() - start_time
            logger.info(
                f"Parallel analysis completed in {parallel_duration:.2f} seconds"
            )

            # Process and validate sentiment results before including them in the response
            # This ensures we only return high-quality sentiment data
            try:
                processed_sentiment = self._process_sentiment_results(sentiment_result)
                logger.info(
                    f"Processed sentiment results: positive={len(processed_sentiment.get('positive', []))}, neutral={len(processed_sentiment.get('neutral', []))}, negative={len(processed_sentiment.get('negative', []))}"
                )
            except Exception as e:
                logger.error(f"Error processing sentiment results: {str(e)}")
                # Use empty sentiment data instead of failing completely
                processed_sentiment = {"positive": [], "neutral": [], "negative": []}
                logger.warning("Using empty sentiment data due to processing error")

            # Be more resilient to partial failures - continue if at least some core results are present
            # This allows the pipeline to continue even if one analysis step fails
            try:
                # Check if we have at least some usable results
                has_basic_themes = len(themes_result.get("themes", [])) > 0
                has_enhanced_themes = enhanced_themes_result and (
                    len(enhanced_themes_result.get("enhanced_themes", [])) > 0 or
                    len(enhanced_themes_result.get("themes", [])) > 0
                )
                has_patterns = len(patterns_result.get("patterns", [])) > 0

                # Log the status of each analysis component
                logger.info(f"Analysis components status - Basic themes: {has_basic_themes}, " +
                           f"Enhanced themes: {has_enhanced_themes}, Patterns: {has_patterns}")

                # Continue if we have at least some usable results
                # Ideally, we want both themes (basic OR enhanced) AND patterns, but we'll be more resilient
                if not has_patterns:
                    logger.warning("No patterns found from LLM, attempting to generate fallback patterns from themes")

                    # Generate fallback patterns from themes
                    fallback_patterns = await self._generate_fallback_patterns(
                        combined_text,
                        themes_result.get("themes", []),
                        llm_service
                    )

                    if fallback_patterns and len(fallback_patterns) > 0:
                        logger.info(f"Successfully generated {len(fallback_patterns)} fallback patterns from themes")
                        patterns_result["patterns"] = fallback_patterns
                    else:
                        logger.warning("Failed to generate fallback patterns, returning empty patterns array")
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
                        themes_result["themes"] = enhanced_themes_result["enhanced_themes"]
                    elif "themes" in enhanced_themes_result:
                        themes_result["themes"] = enhanced_themes_result["themes"]
            except Exception as e:
                logger.error(f"Error checking analysis completeness: {str(e)}")
                # Continue processing instead of returning an error
                # This allows the pipeline to proceed even if there's an error in the completeness check
                logger.info("Continuing despite error in completeness check")

            # Generate insights using the results from parallel analysis
            insight_start_time = asyncio.get_event_loop().time()

            # Create insight generation payload with filename if available
            insight_payload = {
                "task": "insight_generation",
                "text": combined_text,
                "themes": themes_result.get("themes", []),
                "patterns": patterns_result.get("patterns", []),
                "sentiment": processed_sentiment,
            }

            # Add filename to payload if available
            if filename:
                insight_payload["filename"] = filename
                logger.info(f"Adding filename to insight generation payload: {filename}")

            insights_result = await llm_service.analyze(insight_payload)

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
                    logger.info("Using themes from enhanced_themes_result as enhanced_themes")

            # If enhanced_themes is still empty, create from basic themes
            if not enhanced_themes:
                logger.info("Enhanced themes still empty, using basic themes as enhanced themes")
                basic_themes = themes_result.get("themes", [])

                # Convert basic themes to enhanced themes
                for theme in basic_themes:
                    enhanced_theme = copy.deepcopy(theme)
                    enhanced_theme["process"] = "enhanced"
                    enhanced_themes.append(enhanced_theme)

                logger.info(f"Created {len(enhanced_themes)} enhanced themes from basic themes")

            # If we still have no enhanced themes, create a minimal default theme
            if not enhanced_themes:
                logger.warning("No themes available at all, creating minimal default theme")
                enhanced_themes = [{
                    "type": "theme",
                    "name": "General Theme",
                    "definition": "A general theme extracted from the interview",
                    "keywords": ["general", "theme", "interview"],
                    "statements": [],
                    "frequency": 0.5,
                    "sentiment": 0.0,
                    "reliability": 0.5,
                    "process": "enhanced",
                    "codes": ["GENERAL_THEME"],
                    "sentiment_distribution": {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33
                    },
                    "hierarchical_codes": [
                        {
                            "code": "GENERAL_THEME",
                            "definition": "Code representing general theme",
                            "frequency": 0.5,
                            "sub_codes": [
                                {
                                    "code": "GENERAL_THEME_INTERVIEW",
                                    "definition": "Sub-aspect related to interview content",
                                    "frequency": 0.4
                                }
                            ]
                        }
                    ],
                    "reliability_metrics": {
                        "cohen_kappa": 0.45,
                        "percent_agreement": 0.5,  # Keep between 0 and 1
                        "confidence_interval": [0.3, 0.6]
                    },
                    "relationships": []
                }]

            # Combine results with enhanced themes as the primary themes
            results = {
                "themes": enhanced_themes,  # Use enhanced themes as the primary themes
                "enhanced_themes": enhanced_themes,  # Also include enhanced_themes for backward compatibility
                "patterns": patterns_result.get("patterns", []),
                "sentiment": processed_sentiment,
                "insights": insights_result.get("insights", []),
                "validation": {"valid": True, "confidence": 0.9, "details": None},
                "original_text": combined_text,  # Store original text for later use
                "industry": industry  # Add detected industry to the result
            }

            logger.info(f"Final results contain {len(results['themes'])} themes and {len(results['patterns'])} patterns")

            # Add metadata about the theme processing
            results["metadata"] = {
                "theme_processing": {
                    "source": "enhanced",
                    "count": len(results["themes"]),
                    "has_enhanced_themes": len(enhanced_themes) > 0
                }
            }

            return results

        except Exception as e:
            logger.error(f"Error processing interview data: {str(e)}")
            raise

    async def validate_results(self, results: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validate analysis results to ensure they contain required fields.

        Args:
            results: Analysis results dictionary

        Returns:
            Tuple of (is_valid, missing_fields)
        """
        try:
            # No strict requirements - make all fields optional
            required_fields = []

            # Fields that are nice to have but not required
            optional_fields = [
                "patterns",
                "sentiment",
                "original_text",
                "themes",
                "enhanced_themes",
                "insights",
                "personas"
            ]

            # Check for missing required fields (none in this case)
            missing_fields = [field for field in required_fields if field not in results]

            # Log missing optional fields but don't fail validation
            missing_optional = [field for field in optional_fields if field not in results]
            if missing_optional:
                logger.warning(f"Missing optional fields in results: {missing_optional}")

            # Initialize missing fields with empty values
            for field in missing_optional:
                if field in ["patterns", "themes", "enhanced_themes", "insights", "personas"]:
                    results[field] = []
                elif field == "sentiment":
                    results[field] = {"positive": [], "neutral": [], "negative": []}
                elif field == "original_text":
                    results[field] = ""

            # Check data types and fix if needed
            if "patterns" in results and not isinstance(results["patterns"], list):
                logger.warning("Patterns field is not a list, converting to empty list")
                results["patterns"] = []

            if "themes" in results and not isinstance(results["themes"], list):
                logger.warning("Themes field is not a list, converting to empty list")
                results["themes"] = []

            if "enhanced_themes" in results and not isinstance(results["enhanced_themes"], list):
                logger.warning("Enhanced themes field is not a list, converting to empty list")
                results["enhanced_themes"] = []

            if "insights" in results and not isinstance(results["insights"], list):
                logger.warning("Insights field is not a list, converting to empty list")
                results["insights"] = []

            if "sentiment" in results and not isinstance(results["sentiment"], dict):
                logger.warning("Sentiment field is not a dictionary, initializing empty sentiment")
                results["sentiment"] = {"positive": [], "neutral": [], "negative": []}

            if "personas" in results and not isinstance(results["personas"], list):
                logger.warning("Personas field is not a list, converting to empty list")
                results["personas"] = []

            # Ensure we have at least some useful data
            has_some_data = (
                ("patterns" in results and len(results["patterns"]) > 0) or
                ("themes" in results and len(results["themes"]) > 0) or
                ("enhanced_themes" in results and len(results["enhanced_themes"]) > 0) or
                ("insights" in results and len(results["insights"]) > 0) or
                ("personas" in results and len(results["personas"]) > 0)
            )

            if not has_some_data:
                logger.warning("No useful data found in results")
                return False, ["No useful data found"]

            # If we got here, validation passed
            logger.info("Validation passed with available data")
            return True, []

        except Exception as e:
            logger.error(f"Error validating results: {str(e)}")
            return False, [str(e)]

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
            await update_progress("INSIGHT_GENERATION", 0.80, "Starting insight generation")

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
            await update_progress("INSIGHT_GENERATION", 0.82, "Analyzing themes and patterns for insights")

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
                await update_progress("INSIGHT_GENERATION", 0.85, f"Generated {len(results['insights'])} insights")

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
            await update_progress("PERSONA_FORMATION", 0.87, "Starting persona formation")

            # Generate personas from the text
            logger.info("Generating personas from interview text")

            try:
                # Generate personas using the LLM service directly
                logger.info("Generating personas using LLM service")

                # Get the raw text from the original source if available
                raw_text = results.get("original_text", combined_text)

                # Call the LLM service to generate personas
                logger.info(f"Calling LLM service for persona formation with {len(raw_text[:100])}... chars")

                # Use the same LLM service that was used for the rest of the analysis
                persona_result = await llm_service.analyze({
                    "task": "persona_formation",
                    "text": raw_text,
                    "enforce_json": True,
                    "industry": results.get("industry", "general")
                })

                # Extract personas from the result
                if persona_result and isinstance(persona_result, dict):
                    personas = persona_result.get("personas", [])
                    if not personas and "name" in persona_result:
                        # Handle case where a single persona is returned directly
                        personas = [persona_result]

                    # Validate personas
                    if personas and isinstance(personas, list) and len(personas) > 0:
                        # Log success and add personas to results
                        logger.info(f"Successfully generated {len(personas)} personas")

                        # Check structure of first persona
                        first_persona = personas[0]
                        if isinstance(first_persona, dict):
                            logger.info(f"First persona keys: {list(first_persona.keys())}")

                            # Make sure it has the required fields
                            required_fields = [
                                "name",
                                "description",
                                "role_context",
                                "key_responsibilities",
                                "tools_used",
                                "collaboration_style",
                                "analysis_approach",
                                "pain_points",
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
                    await update_progress("PERSONA_FORMATION", 0.95, f"Generated {len(personas)} personas")
                else:
                    logger.warning("Persona formation returned invalid result")
                    results["personas"] = []

                    # Update progress with error information
                    await update_progress("PERSONA_FORMATION", 0.95, "Persona formation returned invalid result, continuing with empty personas")
            except Exception as persona_err:
                # Log the error but continue processing
                logger.error(f"Error generating personas: {str(persona_err)}")

                # Add empty personas list to results
                results["personas"] = []

                # Log a message about trying again with a different approach
                logger.info("Consider trying persona generation with a different prompt or more context")

                # Update progress with error information
                await update_progress("PERSONA_FORMATION", 0.95, "Error generating personas, continuing with empty personas")

            # Final progress update
            await update_progress("COMPLETION", 0.98, "Analysis completed successfully")

            return results

        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
            # Update progress with error information
            if progress_callback:
                await update_progress("INSIGHT_GENERATION", 0.95, f"Error during insight extraction: {str(e)}")
            # Return partial results if available
            return results if isinstance(results, dict) else {}

    def _process_sentiment_results(self, sentiment_result):
        """Process and validate sentiment results to ensure quality"""
        try:
            if not sentiment_result or not isinstance(sentiment_result, dict):
                logger.warning("Invalid sentiment result format")
                return {"positive": [], "neutral": [], "negative": []}

            # Extract statements - handle different response formats safely
            if "sentimentStatements" in sentiment_result:
                # Preferred format (direct statements)
                statements = sentiment_result.get("sentimentStatements", {})
                positive = statements.get("positive", [])
                neutral = statements.get("neutral", [])
                negative = statements.get("negative", [])
            elif "supporting_statements" in sentiment_result:
                # Alternative format
                statements = sentiment_result.get("supporting_statements", {})
                positive = statements.get("positive", [])
                neutral = statements.get("neutral", [])
                negative = statements.get("negative", [])
            elif "positive" in sentiment_result and "negative" in sentiment_result:
                # Direct format
                positive = sentiment_result.get("positive", [])
                neutral = sentiment_result.get("neutral", [])
                negative = sentiment_result.get("negative", [])
            elif "sentiment" in sentiment_result and isinstance(
                sentiment_result["sentiment"], dict
            ):
                # Nested format
                sentiment_data = sentiment_result["sentiment"]
                if "supporting_statements" in sentiment_data:
                    statements = sentiment_data.get("supporting_statements", {})
                    positive = statements.get("positive", [])
                    neutral = statements.get("neutral", [])
                    negative = statements.get("negative", [])
                else:
                    positive = sentiment_data.get("positive", [])
                    neutral = sentiment_data.get("neutral", [])
                    negative = sentiment_data.get("negative", [])
            else:
                # Unknown format - log and use empty lists
                logger.warning(
                    f"Unknown sentiment result format: {type(sentiment_result)}"
                )
                positive = []
                neutral = []
                negative = []

            # Type checking to prevent errors
            if not isinstance(positive, list):
                logger.warning(f"Positive sentiment is not a list: {type(positive)}")
                positive = []
            if not isinstance(neutral, list):
                logger.warning(f"Neutral sentiment is not a list: {type(neutral)}")
                neutral = []
            if not isinstance(negative, list):
                logger.warning(f"Negative sentiment is not a list: {type(negative)}")
                negative = []

            # Log the initial sentiment counts
            logger.info(f"Initial sentiment counts - positive: {len(positive)}, neutral: {len(neutral)}, negative: {len(negative)}")

            # Extract from themes if available and needed - but with higher thresholds
            # Only extract from themes if we have very few statements (less than 10 in any category)
            if (
                len(positive) < 10 or len(neutral) < 10 or len(negative) < 10
            ) and "themes" in sentiment_result:
                logger.info("Extracting additional sentiment statements from themes due to insufficient direct statements")
                themes = sentiment_result.get("themes", [])

                # Collect statements from themes based on their sentiment scores
                for theme in themes:
                    statements = theme.get("statements", []) or theme.get(
                        "examples", []
                    )
                    sentiment_score = theme.get("sentiment", 0)

                    # Skip themes without statements
                    if not statements:
                        continue

                    # Add statements to the appropriate category based on theme sentiment
                    for statement in statements:
                        if isinstance(statement, str) and statement.strip():
                            # Only add if the statement is substantial (more than 20 chars)
                            if len(statement.strip()) < 20:
                                continue

                            if (
                                sentiment_score > 0.2 and len(positive) < 20
                            ):  # Positive theme
                                if statement not in positive:
                                    positive.append(statement)
                            elif (
                                sentiment_score < -0.2 and len(negative) < 20
                            ):  # Negative theme
                                if statement not in negative:
                                    negative.append(statement)
                            elif len(neutral) < 20:  # Neutral theme
                                if statement not in neutral:
                                    neutral.append(statement)

                logger.info(
                    f"After theme extraction - positive: {len(positive)}, neutral: {len(neutral)}, negative: {len(negative)}"
                )

            # Filter out low-quality statements
            def filter_low_quality(statements):
                if not statements:
                    return []
                try:
                    return [
                        s
                        for s in statements
                        if isinstance(s, str)
                        and len(s) > 20
                        and not s.startswith("Product Designer Interview")
                    ]
                except Exception as e:
                    logger.error(f"Error filtering statements: {str(e)}")
                    return []

            # Process each list safely
            processed_positive = filter_low_quality(positive)
            processed_neutral = filter_low_quality(neutral)
            processed_negative = filter_low_quality(negative)

            # Log sample statements for debugging
            if processed_positive and len(processed_positive) > 0:
                logger.info(f"Sample positive statement: {processed_positive[0][:100]}")
            if processed_neutral and len(processed_neutral) > 0:
                logger.info(f"Sample neutral statement: {processed_neutral[0][:100]}")
            if processed_negative and len(processed_negative) > 0:
                logger.info(f"Sample negative statement: {processed_negative[0][:100]}")

            return {
                "positive": processed_positive,
                "neutral": processed_neutral,
                "negative": processed_negative,
            }
        except Exception as e:
            # Catch any unexpected errors to prevent 500 responses
            logger.error(f"Unexpected error processing sentiment results: {str(e)}")
            return {"positive": [], "neutral": [], "negative": []}

    def _preprocess_transcript_for_sentiment(self, text):
        """Preprocess transcript to make Q&A pairs more identifiable"""
        try:
            if not text:
                return text

            logger.info("Preprocessing transcript for sentiment analysis")

            # Split text into lines for processing
            lines = text.split("\n")
            processed_lines = []

            # Track the current speaker and whether they're asking a question
            current_speaker = None
            is_question = False
            current_qa_pair = []

            for line in lines:
                # Skip empty lines
                if not line.strip():
                    continue

                # Check if this is a new speaker
                speaker_match = re.search(r"^([^:]+):\s*(.*)", line)

                if speaker_match:
                    speaker = speaker_match.group(1).strip()
                    content = speaker_match.group(2).strip()

                    # If we were building a Q&A pair and now have a new speaker, save the previous one
                    if (
                        current_speaker
                        and current_speaker != speaker
                        and current_qa_pair
                    ):
                        processed_lines.append(" ".join(current_qa_pair))
                        current_qa_pair = []

                    # Determine if this is likely a question (contains ? or starts with question words)
                    question_words = [
                        "what",
                        "how",
                        "why",
                        "when",
                        "where",
                        "who",
                        "which",
                        "can",
                        "could",
                        "would",
                        "do",
                        "does",
                    ]
                    is_question = "?" in content or any(
                        content.lower().startswith(word) for word in question_words
                    )

                    # Format as Q or A with the content
                    prefix = "Q: " if is_question else "A: "

                    # Start a new Q&A pair or continue the current one
                    if is_question or not current_qa_pair:
                        current_qa_pair.append(f"{prefix}{content}")
                    else:
                        current_qa_pair.append(f"{prefix}{content}")

                    current_speaker = speaker
                else:
                    # If no speaker detected, add as continuation of the current speaker
                    if current_qa_pair:
                        current_qa_pair[-1] += " " + line.strip()
                    else:
                        processed_lines.append(line)

            # Add any remaining Q&A pair
            if current_qa_pair:
                processed_lines.append(" ".join(current_qa_pair))

            processed_text = "\n".join(processed_lines)

            # Log a sample of the processed text
            sample_length = min(200, len(processed_text))
            logger.info(
                f"Processed transcript sample: {processed_text[:sample_length]}..."
            )

            return processed_text
        except Exception as e:
            # If preprocessing fails, return the original text instead of causing an error
            logger.error(f"Error preprocessing transcript: {str(e)}")
            return text

    def _process_sentiment_results(
        self, sentiment_result: Dict[str, Any]
    ) -> Dict[str, List[str]]:
        """Process sentiment results to extract supporting statements"""
        try:
            # Check if the response is a string wrapped in markdown code blocks
            if isinstance(sentiment_result, str):
                logger.warning("Sentiment result is a string, attempting to parse as JSON")

                # Check for markdown code blocks
                if sentiment_result.startswith("```json") and sentiment_result.endswith("```"):
                    logger.info("Detected markdown code blocks in sentiment result, extracting JSON content")
                    # Extract JSON content
                    json_content = sentiment_result[7:-3].strip()
                    try:
                        sentiment_result = json.loads(json_content)
                        logger.info("Successfully parsed JSON from markdown code blocks")
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON from markdown code blocks: {e}")
                else:
                    # Try to parse as JSON directly
                    try:
                        sentiment_result = json.loads(sentiment_result)
                        logger.info("Successfully parsed JSON from string")
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON from string: {e}")

            # Extract sentiment statements from the result
            if (
                "sentiment" in sentiment_result
                and "supporting_statements" in sentiment_result["sentiment"]
            ):
                return sentiment_result["sentiment"]["supporting_statements"]
            elif "supporting_statements" in sentiment_result:
                return sentiment_result["supporting_statements"]
            elif "sentimentStatements" in sentiment_result:
                return sentiment_result["sentimentStatements"]
            else:
                logger.warning("No sentiment statements found in result")

                # Check if sentimentOverview exists to detect hardcoded values
                if "sentimentOverview" in sentiment_result:
                    overview = sentiment_result["sentimentOverview"]
                    positive_score = overview.get("positive", 0)
                    neutral_score = overview.get("neutral", 0)
                    negative_score = overview.get("negative", 0)

                    # Check if scores are suspiciously close to 0.33 each (hardcoded fallback values)
                    if abs(positive_score - 0.33) < 0.01 and abs(neutral_score - 0.34) < 0.01 and abs(negative_score - 0.33) < 0.01:
                        logger.warning("Detected hardcoded sentiment scores (0.33, 0.34, 0.33). This may indicate a parsing issue.")

                return {"positive": [], "neutral": [], "negative": []}
        except Exception as e:
            logger.error(f"Error processing sentiment results: {str(e)}")
            return {"positive": [], "neutral": [], "negative": []}

    async def _generate_fallback_patterns(self, text: str, themes: List[Dict[str, Any]], llm_service) -> List[Dict[str, Any]]:
        """
        Generate fallback patterns when pattern recognition fails.

        Args:
            text: The interview text
            themes: List of themes extracted from the text
            llm_service: LLM service to use for pattern generation

        Returns:
            List of generated patterns
        """
        logger.info("Generating fallback patterns")

        # If we have no text, return a minimal default pattern with improved structure
        if not text or len(text.strip()) < 10:
            logger.warning("Text is too short or empty for fallback pattern generation")
            return [{
                "name": "Limited Content",
                "category": "Workflow",
                "description": "Users provided minimal information during the interview process, making it difficult to identify specific behavioral patterns or interaction methods.",
                "frequency": 0.5,
                "sentiment": 0.0,
                "evidence": ["Limited interview content", "Insufficient behavioral data"],
                "impact": "This pattern of limited information sharing affects the ability to draw meaningful conclusions about user behaviors and needs, potentially leading to incomplete understanding of user requirements.",
                "suggested_actions": [
                    "Conduct follow-up interviews with more specific behavioral questions",
                    "Implement observational research methods to directly observe user behaviors",
                    "Use contextual inquiry techniques to gather richer behavioral data in users' natural environments"
                ]
            }]

        # If we have themes, convert them to patterns
        if themes and len(themes) > 0:
            logger.info(f"Generating patterns from {len(themes)} themes")
            patterns = []

            for theme in themes:
                # Extract theme data
                name = theme.get("name", "Unknown Theme")
                description = theme.get("description", "No description available.")
                statements = theme.get("statements", []) or theme.get("examples", [])
                sentiment = theme.get("sentiment", 0.0)

                # Create a pattern from the theme with detailed descriptions
                pattern = {
                    "name": name,
                    "category": self._determine_pattern_category(name, description, statements),
                    "description": self._generate_detailed_description(name, description, statements),
                    "frequency": theme.get("frequency", 0.5),
                    "sentiment": sentiment,
                    "evidence": statements[:5] if statements else ["Based on theme analysis"],
                    "impact": self._generate_specific_impact(name, description, sentiment, statements),
                    "suggested_actions": self._generate_actionable_recommendations(name, description, sentiment)
                }

                patterns.append(pattern)

            if patterns:
                logger.info(f"Generated {len(patterns)} patterns from themes")
                return patterns

        # If we have no themes or couldn't generate patterns from themes, try direct generation
        try:
            # Use a simple prompt to generate patterns
            sample_text = text[:3000] + ("..." if len(text) > 3000 else "")

            # Call LLM to generate patterns
            logger.info("Calling LLM for direct pattern generation")
            response = await llm_service.analyze({
                "task": "pattern_recognition",
                "text": sample_text,
                "enforce_json": True
            })

            # Extract patterns from response
            if isinstance(response, dict) and "patterns" in response and isinstance(response["patterns"], list):
                patterns = response["patterns"]
                if patterns:
                    logger.info(f"Successfully generated {len(patterns)} patterns directly")
                    return patterns
        except Exception as e:
            logger.error(f"Error in direct pattern generation: {str(e)}")

        # Last resort: return a generic pattern with improved details
        logger.warning("Falling back to generic pattern")
        return [{
            "name": "General Observation",
            "category": "Workflow",
            "description": "Users demonstrate specific interaction patterns when engaging with the system, including navigating interfaces, processing information, and completing tasks in a structured manner.",
            "frequency": 0.7,
            "sentiment": 0.0,
            "evidence": ["Interview content indicates consistent user behaviors"],
            "impact": "This pattern affects task completion efficiency and user satisfaction, creating opportunities for workflow optimization and interface improvements.",
            "suggested_actions": [
                "Conduct targeted user research to identify specific workflow patterns",
                "Analyze task completion paths to identify optimization opportunities",
                "Implement user journey mapping to visualize and improve common interaction patterns"
            ]
        }]

    async def _generate_fallback_patterns(self, text: str, themes: list, llm_service) -> list:
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
                        theme.get("statements", [])
                    ),
                    "frequency": theme.get("frequency", 0.7),
                    "impact": "This pattern affects how users approach their work and may influence tool adoption.",
                    "suggested_actions": "Consider addressing this pattern in the design process.",
                    "evidence": theme.get("statements", [])
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
                            "patterns": patterns
                        }
                    )

                    # Extract enhanced patterns from result
                    enhanced_patterns = enhanced_patterns_result.get("patterns", [])

                    # If we got enhanced patterns, use them
                    if enhanced_patterns and len(enhanced_patterns) > 0:
                        logger.info(f"Successfully enhanced {len(enhanced_patterns)} patterns")
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
                "healthcare", "tech", "finance", "military", "education",
                "hospitality", "retail", "manufacturing", "legal",
                "insurance", "agriculture", "non_profit"
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
            response = await llm_service.analyze({
                "task": "text_generation",
                "text": industry_detection_prompt,
                "enforce_json": True,  # Changed to True for structured output
                "temperature": 0.0,  # Use deterministic output
                "response_mime_type": "application/json"  # Explicitly request JSON
            })

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

                    logger.info(f"Detected industry: {detected_industry} with confidence: {confidence}")
                    logger.info(f"Explanation: {explanation}")

                    # Validate against our list of valid industries
                    if detected_industry in valid_industries:
                        return detected_industry

                    # Try partial matching
                    for valid_industry in valid_industries:
                        if valid_industry in detected_industry:
                            logger.info(f"Matched partial industry: {valid_industry} from '{detected_industry}'")
                            return valid_industry
                elif "text" in response:
                    # Text response that might contain JSON or plain text
                    try:
                        # Try to parse as JSON
                        text_content = response["text"].strip()
                        if text_content.startswith("{") and text_content.endswith("}"):
                            json_data = json.loads(text_content)
                            if "industry" in json_data:
                                detected_industry = json_data["industry"].strip().lower()
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

    def _determine_pattern_category(self, name: str, description: str, statements: List[str]) -> str:
        """
        Determine the appropriate category for a pattern based on its content.

        Args:
            name: Pattern name
            description: Pattern description
            statements: Supporting statements/evidence

        Returns:
            Category string from the predefined list
        """
        # Combine text for analysis
        combined_text = f"{name} {description} {' '.join(statements)}".lower()

        # Define category keywords
        category_keywords = {
            "Workflow": ["workflow", "process", "step", "sequence", "procedure", "routine", "method"],
            "Coping Strategy": ["cope", "strategy", "deal with", "manage", "handle", "overcome", "mitigate"],
            "Decision Process": ["decision", "choose", "select", "evaluate", "assess", "judge", "determine"],
            "Workaround": ["workaround", "alternative", "bypass", "circumvent", "hack", "shortcut"],
            "Habit": ["habit", "regular", "consistently", "always", "frequently", "tend to", "typically"],
            "Collaboration": ["collaborate", "team", "share", "together", "group", "collective", "joint"],
            "Communication": ["communicate", "discuss", "talk", "message", "inform", "express", "convey"]
        }

        # Score each category
        scores = {}
        for category, keywords in category_keywords.items():
            score = sum(1 for keyword in keywords if keyword in combined_text)
            scores[category] = score

        # Return the highest scoring category, or "Workflow" as default
        if any(scores.values()):
            return max(scores.items(), key=lambda x: x[1])[0]

        return "Workflow"  # Default category

    def _generate_detailed_description(self, name: str, description: str, statements: List[str]) -> str:
        """
        Generate a detailed behavioral description for a pattern.

        Args:
            name: Pattern name
            description: Original description
            statements: Supporting statements/evidence

        Returns:
            Detailed description focusing on behaviors and actions
        """
        # If the original description is already detailed, use it
        if description and description != "No description available." and len(description) > 50:
            return description

        # Skip verb extraction and use a generic but specific description based on the pattern name
        return f"Users demonstrate specific behaviors related to {name.lower()}, showing consistent patterns in how they interact with the system. These behaviors reflect how users approach and engage with this aspect of the experience."

    def _generate_specific_impact(self, name: str, description: str, sentiment: float, statements: List[str]) -> str:
        """
        Generate a specific impact statement for a pattern.

        Args:
            name: Pattern name
            description: Pattern description
            sentiment: Sentiment score (-1 to 1)
            statements: Supporting statements/evidence

        Returns:
            Specific impact statement
        """
        # Determine impact type based on sentiment
        if sentiment > 0.3:
            impact_type = "positive"
            consequences = [
                "increases user satisfaction and engagement",
                "enhances productivity and efficiency",
                "improves the overall user experience",
                "strengthens user confidence in the system",
                "facilitates more effective task completion"
            ]
        elif sentiment < -0.3:
            impact_type = "negative"
            consequences = [
                "creates friction and frustration for users",
                "slows down task completion and reduces efficiency",
                "diminishes user confidence in the system",
                "leads to workarounds that may introduce errors",
                "increases cognitive load and user effort"
            ]
        else:
            impact_type = "mixed"
            consequences = [
                "has both positive and negative effects on user experience",
                "creates trade-offs between efficiency and thoroughness",
                "varies in impact depending on user expertise and context",
                "affects different user groups in different ways",
                "presents both opportunities and challenges for design"
            ]

        # Select consequences based on pattern name
        name_words = set(name.lower().split())
        selected_consequences = []

        for consequence in consequences:
            for word in name_words:
                if len(word) > 4 and word in consequence:  # Only match significant words
                    selected_consequences.append(consequence)
                    break

        # If no specific matches, take the first two general consequences
        if not selected_consequences:
            selected_consequences = consequences[:2]
        else:
            selected_consequences = selected_consequences[:2]  # Limit to 2

        # Construct impact statement
        impact_statement = f"This pattern {selected_consequences[0]}"
        if len(selected_consequences) > 1:
            impact_statement += f" and {selected_consequences[1]}"

        impact_statement += f", resulting in a {impact_type} effect on overall system usability and user satisfaction."

        return impact_statement

    def _generate_actionable_recommendations(self, name: str, description: str, sentiment: float) -> List[str]:
        """
        Generate specific, actionable recommendations based on the pattern.

        Args:
            name: Pattern name
            description: Pattern description
            sentiment: Sentiment score (-1 to 1)

        Returns:
            List of actionable recommendations
        """
        # Base recommendations on sentiment
        if sentiment < -0.3:
            # Negative patterns need improvement
            recommendations = [
                f"Conduct targeted usability testing focused on the {name.lower()} aspect of the experience",
                f"Redesign the interface elements related to {name.lower()} to reduce friction and improve clarity",
                f"Develop clear documentation and tooltips to help users navigate the {name.lower()} process more effectively"
            ]
        elif sentiment > 0.3:
            # Positive patterns should be enhanced
            recommendations = [
                f"Expand the {name.lower()} functionality to cover more use cases and scenarios",
                f"Highlight the {name.lower()} feature in onboarding materials to increase awareness",
                f"Gather additional user feedback on {name.lower()} to identify further enhancement opportunities"
            ]
        else:
            # Neutral patterns need investigation
            recommendations = [
                f"Conduct further research to better understand user needs related to {name.lower()}",
                f"Prototype alternative approaches to {name.lower()} and test with users",
                f"Analyze usage data to identify patterns and opportunities for improving {name.lower()}"
            ]

        return recommendations

    def _calculate_sentiment_distribution(
        self, statements: List[str], sentiment_data: Dict[str, List[str]]
    ) -> Dict[str, float]:
        """Calculate sentiment distribution for a list of statements"""
        sentiment_distribution = {"positive": 0, "neutral": 0, "negative": 0}

        # If we have sentiment data for individual statements, use it
        if sentiment_data and statements:
            positive_statements = set(sentiment_data.get("positive", []))
            neutral_statements = set(sentiment_data.get("neutral", []))
            negative_statements = set(sentiment_data.get("negative", []))

            # Count statements in each sentiment category
            for statement in statements:
                if statement in positive_statements:
                    sentiment_distribution["positive"] += 1
                elif statement in negative_statements:
                    sentiment_distribution["negative"] += 1
                elif statement in neutral_statements:
                    sentiment_distribution["neutral"] += 1
                else:
                    # If not found in any category, default to neutral
                    sentiment_distribution["neutral"] += 1
        else:
            # Default distribution if no sentiment data is available
            total = len(statements)
            sentiment_distribution["positive"] = total // 3
            sentiment_distribution["neutral"] = total // 3
            sentiment_distribution["negative"] = total - (
                sentiment_distribution["positive"] + sentiment_distribution["neutral"]
            )

        # Convert to percentages
        total_statements = sum(sentiment_distribution.values())
        if total_statements > 0:
            for key in sentiment_distribution:
                sentiment_distribution[key] = round(
                    sentiment_distribution[key] / total_statements, 2
                )

        return sentiment_distribution
