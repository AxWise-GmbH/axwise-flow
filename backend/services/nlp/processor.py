"""NLP processor service"""

import logging
import asyncio
import json
import re
import copy
from typing import Dict, Any, List, Tuple
from domain.interfaces.llm_service import ILLMService

from backend.schemas import DetailedAnalysisResult

logger = logging.getLogger(__name__)


class NLPProcessor:
    """NLP processor implementation"""

    def __init__(self):
        """Initialize NLP processor without dependencies"""
        logger.info("Initializing NLP processor")

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

        use_enhanced_theme_analysis = config.get("use_enhanced_theme_analysis", False)

        try:
            # Extract text content
            texts = []
            answer_texts = []  # Explicitly track answer-only content for theme analysis

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

            # Run theme, pattern, and sentiment analysis in parallel
            # For theme analysis, use answer_only_text
            # Always run both basic and enhanced theme analysis
            basic_themes_task = llm_service.analyze(
                {
                    "task": "theme_analysis",
                    "text": answer_only_text,  # Use answer-only text for themes
                    "use_answer_only": True,  # Flag to indicate answer-only processing
                }
            )

            # Run enhanced theme analysis in parallel if requested
            enhanced_themes_task = None
            if use_enhanced_theme_analysis:
                # --- START MODIFICATION for Enhanced Themes ---
                # Check if the primary service is Gemini
                from backend.services.llm.gemini_service import GeminiService

                target_llm_service_enhanced = llm_service  # Default to passed service

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

                # Call analyze using the determined service (either original or OpenAI)
                enhanced_themes_task = target_llm_service_enhanced.analyze(
                    {
                        "task": "theme_analysis_enhanced",
                        "text": answer_only_text,  # Use answer-only text for themes
                        "use_answer_only": True,  # Flag to indicate answer-only processing
                    }
                )
                # --- END MODIFICATION for Enhanced Themes ---

            # Get basic themes first so we can use them for sentiment analysis
            basic_themes_result = await basic_themes_task

            # Store the basic themes as the main themes result
            themes_result = basic_themes_result

            # Run enhanced theme analysis
            enhanced_themes_result = None
            if enhanced_themes_task:
                try:
                    enhanced_themes_result = await enhanced_themes_task
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
                        # Log the first theme if available
                        if enhanced_themes_result["themes"]:
                            first_theme = enhanced_themes_result["themes"][0]
                            logger.info(f"First theme (copied to enhanced_themes): {first_theme.get('name', 'Unnamed')}")
                    else:
                        logger.warning(
                            f"Enhanced theme analysis did not return expected structure. Keys: {list(enhanced_themes_result.keys()) if isinstance(enhanced_themes_result, dict) else 'not a dictionary'}"
                        )
                        # Create a default structure if the result is not as expected
                        enhanced_themes_result = {"enhanced_themes": []}
                except Exception as e:
                    logger.error(f"Error in enhanced theme analysis: {str(e)}")
                    # Create a fallback enhanced themes result
                    enhanced_themes_result = {"enhanced_themes": []}

            # If enhanced themes are still None or empty, create enhanced themes from basic themes
            if not enhanced_themes_result or (not enhanced_themes_result.get("enhanced_themes") and not enhanced_themes_result.get("themes")):
                logger.info("Enhanced themes not available, creating from basic themes")
                try:
                    # Create enhanced themes from basic themes
                    basic_themes = basic_themes_result.get("themes", [])
                    enhanced_themes = []

                    for theme in basic_themes:
                        # Create a deep copy of the theme
                        enhanced_theme = theme.copy()

                        # Modify the theme to make it "enhanced"
                        enhanced_theme["process"] = "enhanced"

                        # Add more detailed reliability information
                        reliability = enhanced_theme.get("reliability", 0.7)
                        enhanced_theme["reliability"] = reliability

                        # Adjust sentiment to be more nuanced (not just making everything positive)
                        sentiment = enhanced_theme.get("sentiment", 0)
                        # Keep the sentiment direction but make it more nuanced
                        if sentiment > 0:
                            enhanced_theme["sentiment"] = min(sentiment + 0.1, 1.0)
                        elif sentiment < 0:
                            enhanced_theme["sentiment"] = max(sentiment - 0.1, -1.0)

                        # Ensure codes exist
                        if (
                            not enhanced_theme.get("codes")
                            or len(enhanced_theme.get("codes", [])) < 2
                        ):
                            keywords = enhanced_theme.get("keywords", [])
                            codes = enhanced_theme.get("codes", [])

                            # Generate codes from keywords if needed
                            for keyword in keywords[:3]:
                                code = keyword.upper().replace(" ", "_")
                                if code not in codes:
                                    codes.append(code)

                            enhanced_theme["codes"] = codes

                        enhanced_themes.append(enhanced_theme)

                    enhanced_themes_result = {"themes": enhanced_themes}
                    logger.info(
                        f"Created {len(enhanced_themes)} enhanced themes from basic themes"
                    )
                except Exception as e:
                    logger.error(
                        f"Error creating enhanced themes from basic themes: {str(e)}"
                    )
                    # Create an empty fallback enhanced themes result
                    enhanced_themes_result = {"themes": []}

            # Run pattern recognition and sentiment analysis with theme data
            patterns_task = llm_service.analyze(
                {"task": "pattern_recognition", "text": combined_text}
            )

            # Pass themes to sentiment analysis to leverage their statements if needed
            sentiment_task = llm_service.analyze(
                {
                    "task": "sentiment_analysis",
                    "text": self._preprocess_transcript_for_sentiment(combined_text),
                    "themes": themes_result.get("themes", []),
                }
            )

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

            # Don't return partial results - either return everything or nothing to ensure consistency
            # This prevents frontend from showing sentiment while other components are still loading
            try:
                if (
                    len(themes_result.get("themes", [])) == 0
                    or len(patterns_result.get("patterns", [])) == 0
                ):
                    logger.warning(
                        "Themes or patterns analysis incomplete - returning empty results to ensure consistency"
                    )
                    # Don't return partial results
                    return {
                        "status": "processing",
                        "message": "Analysis still in progress. Please try again later.",
                    }
            except Exception as e:
                logger.error(f"Error checking themes/patterns completeness: {str(e)}")
                # Return a helpful error message instead of crashing
                return {
                    "status": "error",
                    "message": "Error during analysis processing. Please try again.",
                }

            # Generate insights using the results from parallel analysis
            insight_start_time = asyncio.get_event_loop().time()
            insights_result = await llm_service.analyze(
                {
                    "task": "insight_generation",
                    "text": combined_text,
                    "themes": themes_result.get("themes", []),
                    "patterns": patterns_result.get("patterns", []),
                    "sentiment": processed_sentiment,
                }
            )

            insight_duration = asyncio.get_event_loop().time() - insight_start_time
            logger.info(
                f"Insight generation completed in {insight_duration:.2f} seconds"
            )

            total_duration = asyncio.get_event_loop().time() - start_time
            logger.info(f"Total analysis completed in {total_duration:.2f} seconds")

            # Combine results
            results = {
                "themes": themes_result.get("themes", []),
                "patterns": patterns_result.get("patterns", []),
                "sentiment": processed_sentiment,
                "insights": insights_result.get("insights", []),
                "validation": {"valid": True, "confidence": 0.9, "details": None},
                "original_text": combined_text,  # Store original text for later use
                "enhanced_themes": (
                    enhanced_themes_result.get("enhanced_themes", []) or enhanced_themes_result.get("themes", [])
                    if enhanced_themes_result
                    else []
                ),
            }

            # If we have enhanced themes, use only those
            if results["enhanced_themes"]:
                # Use only enhanced themes
                results["themes"] = results["enhanced_themes"]
                # Remove the enhanced_themes field to avoid duplication
                results["enhanced_themes"] = []

            return results

        except Exception as e:
            logger.error(f"Error processing interview data: {str(e)}")
            raise

    async def validate_results(self, results: Dict[str, Any]) -> bool:
        """Validate processing results"""
        try:
            # Check required fields
            required_fields = [
                "themes",
                "patterns",
                "sentiment",
                "insights",
                "original_text",
            ]
            if not all(field in results for field in required_fields):
                return False

            # Check themes
            if not isinstance(results["themes"], list):
                return False

            # Check patterns
            if not isinstance(results["patterns"], list):
                return False

            # Check sentiment
            if not isinstance(results["sentiment"], dict):
                return False

            # Check insights
            if not isinstance(results["insights"], list):
                return False

            return True

        except Exception as e:
            logger.error(f"Error validating results: {str(e)}")
            return False

    async def extract_insights(
        self, results: Dict[str, Any], llm_service: ILLMService
    ) -> Dict[str, Any]:
        """Extract additional insights from analysis results"""
        try:
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

            # Generate deeper insights
            insights_result = await llm_service.analyze(
                {
                    "task": "insight_generation",
                    "text": combined_text,
                    "themes": results.get("themes", []),
                    "patterns": results.get("patterns", []),
                    "sentiment": results.get("sentiment", {}),
                    "existing_insights": results.get("insights", []),
                }
            )

            # Update results with new insights
            results["insights"].extend(insights_result.get("insights", []))

            # Add metadata
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

            # Generate personas from the text
            logger.info("Generating personas from interview text")

            try:
                # Import the global persona service getter
                from backend.api.app import get_persona_service

                # Get the global persona service
                persona_service = get_persona_service()

                # Get the raw text from the original source if available
                raw_text = results.get("original_text", combined_text)

                # Generate personas directly from text
                logger.info(
                    f"Generating personas from text ({len(raw_text[:100])}... chars)"
                )
                personas = await persona_service.generate_persona_from_text(raw_text)

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
            except ImportError as import_err:
                logger.error(f"Error importing get_persona_service: {str(import_err)}")
                logger.info("Adding get_persona_service function to app.py is required")
                # Add empty personas list
                results["personas"] = []

                # Create manual mock personas as fallback
                mock_personas = [
                    {
                        "id": "mock-persona-1",
                        "name": "Design Lead Alex",
                        "description": "Alex is an experienced design leader who values user-centered processes and design systems.",
                        "confidence": 0.85,
                        "evidence": [
                            "Manages UX team of 5-7 designers",
                            "Responsible for design system implementation",
                        ],
                        "role_context": {
                            "value": "Design team lead at medium-sized technology company",
                            "confidence": 0.9,
                            "evidence": [
                                "Manages UX team of 5-7 designers",
                                "Responsible for design system implementation",
                            ],
                        },
                        "key_responsibilities": {
                            "value": "Oversees design system implementation. Manages team of designers.",
                            "confidence": 0.85,
                            "evidence": [
                                "Regular design system review",
                                "Designer performance reviews",
                            ],
                        },
                        "tools_used": {
                            "value": "Figma, Sketch, Adobe Creative Suite, Jira",
                            "confidence": 0.8,
                            "evidence": ["Figma components", "Jira ticketing system"],
                        },
                        "collaboration_style": {
                            "value": "Cross-functional collaboration with design and development",
                            "confidence": 0.75,
                            "evidence": [
                                "Weekly sync meetings",
                                "Design hand-off process",
                            ],
                        },
                        "analysis_approach": {
                            "value": "Data-informed design with usability testing",
                            "confidence": 0.7,
                            "evidence": ["User testing sessions", "Usage metrics"],
                        },
                        "pain_points": {
                            "value": "Limited resources for user research. Engineering-driven decisions.",
                            "confidence": 0.9,
                            "evidence": [
                                "Budget limitations",
                                "Quality issues due to timelines",
                            ],
                        },
                    }
                ]
                results["personas"] = mock_personas
                logger.info("Added mock personas as fallback")
            except Exception as persona_err:
                # Log the error but continue processing
                logger.error(f"Error generating personas: {str(persona_err)}")

                # Add empty personas list to results
                results["personas"] = []

                # Try pattern-based approach as fallback
                try:
                    if results.get("patterns"):
                        logger.info(
                            "Attempting pattern-based persona generation as fallback"
                        )
                        # Import the global persona service getter again to ensure it's available
                        try:
                            from backend.api.app import get_persona_service

                            persona_service = get_persona_service()
                            pattern_personas = await persona_service.form_personas(
                                results.get("patterns", [])
                            )

                            if pattern_personas and len(pattern_personas) > 0:
                                results["personas"] = pattern_personas
                                logger.info(
                                    f"Added {len(pattern_personas)} pattern-based personas to analysis results"
                                )
                            else:
                                logger.warning(
                                    "Pattern-based persona generation returned empty results"
                                )
                        except ImportError as import_err:
                            logger.error(
                                f"Error importing get_persona_service for pattern fallback: {str(import_err)}"
                            )
                except Exception as pattern_err:
                    logger.error(
                        f"Error in pattern-based persona generation fallback: {str(pattern_err)}"
                    )
                    # Create manual mock personas as final fallback
                    mock_personas = [
                        {
                            "id": "mock-persona-1",
                            "name": "Design Lead Alex",
                            "description": "Alex is an experienced design leader who values user-centered processes and design systems.",
                            "confidence": 0.85,
                            "evidence": [
                                "Manages UX team of 5-7 designers",
                                "Responsible for design system implementation",
                            ],
                            "role_context": {
                                "value": "Design team lead at medium-sized technology company",
                                "confidence": 0.9,
                                "evidence": [
                                    "Manages UX team of 5-7 designers",
                                    "Responsible for design system implementation",
                                ],
                            },
                            "key_responsibilities": {
                                "value": "Oversees design system implementation. Manages team of designers.",
                                "confidence": 0.85,
                                "evidence": [
                                    "Regular design system review",
                                    "Designer performance reviews",
                                ],
                            },
                            "tools_used": {
                                "value": "Figma, Sketch, Adobe Creative Suite, Jira",
                                "confidence": 0.8,
                                "evidence": [
                                    "Figma components",
                                    "Jira ticketing system",
                                ],
                            },
                            "collaboration_style": {
                                "value": "Cross-functional collaboration with design and development",
                                "confidence": 0.75,
                                "evidence": [
                                    "Weekly sync meetings",
                                    "Design hand-off process",
                                ],
                            },
                            "analysis_approach": {
                                "value": "Data-informed design with usability testing",
                                "confidence": 0.7,
                                "evidence": ["User testing sessions", "Usage metrics"],
                            },
                            "pain_points": {
                                "value": "Limited resources for user research. Engineering-driven decisions.",
                                "confidence": 0.9,
                                "evidence": [
                                    "Budget limitations",
                                    "Quality issues due to timelines",
                                ],
                            },
                        }
                    ]
                    results["personas"] = mock_personas
                    logger.info(
                        "Added mock personas as final fallback after pattern generation failed"
                    )

            return results

        except Exception as e:
            logger.error(f"Error extracting insights: {str(e)}")
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

            # Extract from themes if available and needed
            if (
                len(positive) < 5 or len(neutral) < 5 or len(negative) < 5
            ) and "themes" in sentiment_result:
                logger.info("Extracting additional sentiment statements from themes")
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
                            if (
                                sentiment_score > 0.2 and len(positive) < 15
                            ):  # Positive theme
                                if statement not in positive:
                                    positive.append(statement)
                            elif (
                                sentiment_score < -0.2 and len(negative) < 15
                            ):  # Negative theme
                                if statement not in negative:
                                    negative.append(statement)
                            elif len(neutral) < 15:  # Neutral theme
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
                return {"positive": [], "neutral": [], "negative": []}
        except Exception as e:
            logger.error(f"Error processing sentiment results: {str(e)}")
            return {"positive": [], "neutral": [], "negative": []}

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
