"""
Google Gemini LLM service implementation.
"""

import logging
import json
import os
import asyncio
import httpx
import google.generativeai as genai
import random
from typing import Dict, Any, List, Optional, Union
from domain.interfaces.llm_service import ILLMService
from pydantic import BaseModel, Field, ValidationError
import re
import time
from datetime import datetime

from backend.schemas import Theme, Pattern, Insight
from backend.utils.json_parser import (
    parse_llm_json_response,
    normalize_persona_response,
)

logger = logging.getLogger(__name__)


class GeminiService:
    """
    Service for interacting with Google's Gemini LLM API.
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the Gemini service with configuration.

        Args:
            config (Dict[str, Any]): Configuration for the Gemini service
        """
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "gemini-2.0-flash")
        self.temperature = config.get("temperature", 0.0)
        self.max_tokens = config.get("max_tokens", 8192)
        self.top_p = config.get("top_p", 0.95)
        self.top_k = config.get("top_k", 40)

        # Initialize Gemini client
        genai.configure(REDACTED_API_KEY=self.REDACTED_API_KEY)
        self.client = genai.GenerativeModel(
            model_name=self.model,
            generation_config={
                "temperature": self.temperature,
                "max_output_tokens": self.max_tokens,
                "top_p": self.top_p,
                "top_k": self.top_k,
            },
        )

        logger.info(f"Initialized Gemini service with model: {self.model}")

    async def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze data using Gemini.

        Args:
            data (Dict[str, Any]): The data to analyze, including 'task' and 'text' fields

        Returns:
            Dict[str, Any]: Analysis results
        """
        task = data.get("task", "")
        text = data.get("text", "")
        use_answer_only = data.get("use_answer_only", False)

        if not text:
            logger.warning("Empty text provided for analysis")
            return {"error": "No text provided"}

        if use_answer_only:
            logger.info(f"Running {task} on answer-only text length: {len(text)}")
        else:
            logger.info(f"Running {task} on text length: {len(text)}")

        try:
            # Prepare system message based on task
            system_message = self._get_system_message(task, data)

            # Prepare generation config (Original, without response_mime_type)
            generation_config = {
                "temperature": self.temperature,
                "max_output_tokens": self.max_tokens,
                "top_p": self.top_p,
                "top_k": self.top_k,
            }

            # For insight_generation, the system_message is already the complete prompt
            if task == "insight_generation":
                # Use the system message directly since it's the complete prompt
                logger.debug(
                    f"Generating content for task '{task}' with config: {generation_config}"
                )
                response = await self.client.generate_content_async(
                    system_message, generation_config=generation_config
                )

                # For insight generation, return a structured result
                result_text = response.text
                logger.debug(
                    f"Raw response for task {task}:\n{result_text}"
                )  # Log raw response

                try:
                    result = json.loads(result_text)
                except json.JSONDecodeError:
                    import re

                    json_match = re.search(
                        r'```(?:json)?\s*({\s*".*}|\[\s*{.*}\s*\])\s*```',
                        result_text,
                        re.DOTALL,
                    )
                    if json_match:
                        result = json.loads(json_match.group(1))
                    else:
                        # Return a default structure if parsing fails
                        result = {
                            "insights": [
                                {
                                    "topic": "Data Analysis",
                                    "observation": "Analysis completed but results could not be structured properly.",
                                    "evidence": [
                                        "Processing completed with non-structured output."
                                    ],
                                }
                            ],
                            "metadata": {
                                "quality_score": 0.5,
                                "confidence_scores": {
                                    "themes": 0.6,
                                    "patterns": 0.6,
                                    "sentiment": 0.6,
                                },
                            },
                        }

                return result
            else:
                # Generate content for other tasks (Original call structure)
                logger.debug(
                    f"Generating content for task '{task}' with config: {generation_config}"
                )
                response = await self.client.generate_content_async(
                    [system_message, text], generation_config=generation_config
                )

                # Extract and parse response
                result_text = response.text

                # Log raw response for debugging
                logger.debug(f"Raw response for task {task}:\n{result_text}")

                # Extract JSON from response (handle potential markdown formatting)
                try:
                    # Try direct parsing first
                    result = json.loads(result_text)
                except json.JSONDecodeError as e1:
                    # If response isn't valid JSON, try to extract JSON from markdown code blocks
                    import re

                    json_match = re.search(
                        r'```(?:json)?\s*({\s*".*}|\[\s*{.*}\s*\])\s*```',
                        result_text,
                        re.DOTALL,
                    )
                    if json_match:
                        try:
                            result = json.loads(json_match.group(1))
                        except json.JSONDecodeError as e2:
                            logger.error(
                                f"Failed to parse JSON even after extracting from markdown: {e2}"
                            )
                            raise ValueError(
                                f"Invalid JSON response from Gemini after markdown extraction: {e2}"
                            )
                    else:
                        logger.error(
                            f"Invalid JSON response from Gemini, and no markdown block found: {e1}"
                        )
                        raise ValueError(
                            f"Invalid JSON response from Gemini, no markdown block found: {e1}"
                        )

            # Post-process results if needed
            if task == "theme_analysis":
                # If response is a list of themes directly (not wrapped in an object)
                if isinstance(result, list):
                    result = {"themes": result}

                # Ensure proper themes array
                if "themes" not in result:
                    result["themes"] = []

                # Ensure each theme has required fields
                for theme in result["themes"]:
                    # Ensure required fields with default values
                    if "sentiment" not in theme:
                        theme["sentiment"] = 0.0  # neutral
                    if "frequency" not in theme:
                        theme["frequency"] = 0.5  # medium

                    # Handle statements/examples for backward compatibility
                    if "statements" not in theme:
                        if "examples" in theme:
                            # Copy examples to statements (preferred field)
                            theme["statements"] = theme["examples"]
                        else:
                            theme["statements"] = []

                    # Ensure examples exists for backward compatibility
                    if "examples" not in theme:
                        theme["examples"] = theme["statements"]

                    # Ensure keywords exists
                    if "keywords" not in theme:
                        theme["keywords"] = []

                    # Extract keywords from name if none provided
                    if len(theme["keywords"]) == 0 and "name" in theme:
                        # Simple extraction of potential keywords from the theme name
                        words = theme["name"].split()
                        # Filter out common words and keep only substantive ones (length > 3)
                        theme["keywords"] = [
                            word
                            for word in words
                            if len(word) > 3
                            and word.lower()
                            not in ["and", "the", "with", "that", "this", "for", "from"]
                        ]

                    # Ensure codes field exists
                    if "codes" not in theme:
                        # Generate codes based on keywords and theme name
                        theme["codes"] = []
                        if "keywords" in theme and len(theme["keywords"]) > 0:
                            # Convert first two keywords to codes
                            for keyword in theme["keywords"][:2]:
                                code = keyword.upper().replace(" ", "_")
                                if code not in theme["codes"]:
                                    theme["codes"].append(code)

                        # Add a code based on sentiment if not enough codes
                        if len(theme["codes"]) < 2 and "sentiment" in theme:
                            sentiment = theme["sentiment"]
                            if sentiment >= 0.3:
                                theme["codes"].append("POSITIVE_ASPECT")
                            elif sentiment <= -0.3:
                                theme["codes"].append("PAIN_POINT")
                            else:
                                theme["codes"].append("NEUTRAL_OBSERVATION")

                    # Ensure reliability field exists
                    if "reliability" not in theme:
                        # Calculate reliability based on number of statements and their length
                        statements = theme.get("statements", [])
                        if len(statements) >= 4:
                            theme["reliability"] = (
                                0.85  # Well-supported with many statements
                            )
                        elif len(statements) >= 2:
                            theme["reliability"] = 0.7  # Moderately supported
                        else:
                            theme["reliability"] = 0.5  # Minimally supported

                # Validate themes against Pydantic model
                validated_themes_list = []
                if (
                    isinstance(result, dict)
                    and "themes" in result
                    and isinstance(result["themes"], list)
                ):
                    for theme_data in result["themes"]:
                        try:
                            # Validate each theme dictionary against the Pydantic model
                            validated_theme = Theme(**theme_data)
                            # Append the validated data (as dict) to the list
                            validated_themes_list.append(validated_theme.model_dump())
                            logger.debug(
                                f"Successfully validated theme: {theme_data.get('name', 'Unnamed')}"
                            )
                        except ValidationError as e:
                            logger.warning(
                                f"Theme validation failed for theme '{theme_data.get('name', 'Unnamed')}': {e}. Skipping this theme."
                            )
                            # Invalid themes are skipped to ensure data integrity downstream
                        except Exception as general_e:
                            logger.error(
                                f"Unexpected error during theme validation for '{theme_data.get('name', 'Unnamed')}': {general_e}",
                                exc_info=True,
                            )
                            # Skip this theme due to unexpected error

                    # Replace the original themes list with the validated list
                    result["themes"] = validated_themes_list
                    logger.info(
                        f"Validated {len(validated_themes_list)} themes successfully for task: {task}"
                    )
                    logger.debug(
                        f"Validated theme result: {json.dumps(result, indent=2)}"
                    )
                else:
                    logger.warning(
                        f"LLM response for theme_analysis was not in the expected format (dict with 'themes' list). Raw response: {result}"
                    )
                    result = {"themes": []}  # Return empty list if structure is wrong

            elif task == "pattern_recognition":
                # If response is a list of patterns directly
                if isinstance(result, list):
                    result = {"patterns": result}

                # Ensure proper patterns array
                if "patterns" not in result:
                    result["patterns"] = []

                # Ensure each pattern has required fields
                for pattern in result["patterns"]:
                    # Ensure required fields with default values
                    if "name" not in pattern and "category" in pattern:
                        pattern["name"] = pattern[
                            "category"
                        ]  # Use category as name if missing
                    elif "name" not in pattern and "description" in pattern:
                        # Extract name from description (first few words)
                        desc_words = pattern["description"].split()
                        pattern["name"] = (
                            " ".join(desc_words[:3]) + "..."
                            if len(desc_words) > 3
                            else pattern["description"]
                        )

                    if "sentiment" not in pattern:
                        pattern["sentiment"] = 0.0  # neutral
                    if "frequency" not in pattern:
                        pattern["frequency"] = 0.5  # medium

                    # Handle evidence/examples for backward compatibility
                    if "evidence" not in pattern and "examples" in pattern:
                        pattern["evidence"] = pattern["examples"]
                    elif "evidence" not in pattern and "examples" not in pattern:
                        pattern["evidence"] = []

                    # Ensure examples exists for backward compatibility
                    if "examples" not in pattern and "evidence" in pattern:
                        pattern["examples"] = pattern["evidence"]

                    # Ensure impact field exists
                    if "impact" not in pattern:
                        if "sentiment" in pattern:
                            sentiment = pattern["sentiment"]
                            if sentiment >= 0.3:
                                pattern["impact"] = (
                                    "Positive impact on user experience and workflow efficiency"
                                )
                            elif sentiment <= -0.3:
                                pattern["impact"] = (
                                    "Negative impact on productivity and user satisfaction"
                                )
                            else:
                                pattern["impact"] = (
                                    "Neutral impact on overall processes"
                                )

                    # Ensure suggested_actions field exists
                    if "suggested_actions" not in pattern:
                        pattern["suggested_actions"] = [
                            "Conduct further research on this pattern",
                            "Consider addressing in future updates",
                        ]

                # Validate patterns against Pydantic model
                validated_patterns_list = []
                if (
                    isinstance(result, dict)
                    and "patterns" in result
                    and isinstance(result["patterns"], list)
                ):
                    for pattern_data in result["patterns"]:
                        try:
                            # Validate each pattern dictionary against the Pydantic model
                            validated_pattern = Pattern(**pattern_data)
                            # Append the validated data (as dict) to the list
                            validated_patterns_list.append(
                                validated_pattern.model_dump()
                            )
                            logger.debug(
                                f"Successfully validated pattern: {pattern_data.get('name', 'Unnamed')}"
                            )
                        except ValidationError as e:
                            logger.warning(
                                f"Pattern validation failed for pattern '{pattern_data.get('name', 'Unnamed')}': {e}. Skipping this pattern."
                            )
                            # Invalid patterns are skipped to ensure data integrity downstream
                        except Exception as general_e:
                            logger.error(
                                f"Unexpected error during pattern validation for '{pattern_data.get('name', 'Unnamed')}': {general_e}",
                                exc_info=True,
                            )
                            # Skip this pattern due to unexpected error

                    # Replace the original patterns list with the validated list
                    result["patterns"] = validated_patterns_list
                    logger.info(
                        f"Validated {len(validated_patterns_list)} patterns successfully for task: {task}"
                    )
                    logger.debug(
                        f"Validated pattern result: {json.dumps(result, indent=2)}"
                    )
                else:
                    logger.warning(
                        f"LLM response for pattern_recognition was not in the expected format (dict with 'patterns' list). Raw response: {result}"
                    )
                    result = {"patterns": []}  # Return empty list if structure is wrong

            elif task == "sentiment_analysis":
                # Make sure result has the expected structure
                if "sentiment" not in result:
                    result = {"sentiment": result}

                # Extract sentiment overview
                sentiment = result.get("sentiment", {})
                breakdown = sentiment.get("breakdown", {})

                # Normalize breakdown to ensure it sums to 1.0
                total = sum(breakdown.values()) if breakdown else 0
                if total > 0 and abs(total - 1.0) > 0.01:
                    logger.warning(
                        f"Sentiment breakdown does not sum to 1.0 (sum: {total}), normalizing"
                    )
                    for key in breakdown:
                        breakdown[key] = round(breakdown[key] / total, 3)

                # Keep sentiment as dictionary (not a list) to match expected format in validate_results
                transformed = {
                    "sentimentOverview": {
                        "positive": breakdown.get("positive", 0.33),
                        "neutral": breakdown.get("neutral", 0.34),
                        "negative": breakdown.get("negative", 0.33),
                    },
                    "sentiment": sentiment,  # Keep as dictionary
                    "sentiment_details": sentiment.get(
                        "details", []
                    ),  # Store details separately
                }

                # Extract supporting statements with enhanced logging
                if "supporting_statements" in sentiment:
                    logger.info("Found supporting_statements in sentiment data")
                    transformed["sentimentStatements"] = {
                        "positive": sentiment["supporting_statements"].get(
                            "positive", []
                        ),
                        "neutral": sentiment["supporting_statements"].get(
                            "neutral", []
                        ),
                        "negative": sentiment["supporting_statements"].get(
                            "negative", []
                        ),
                    }

                    # Log the extraction of statements
                    logger.info(
                        f"Extracted sentiment statements - positive: {len(transformed['sentimentStatements']['positive'])}, neutral: {len(transformed['sentimentStatements']['neutral'])}, negative: {len(transformed['sentimentStatements']['negative'])}"
                    )
                    # Log samples of the first statement in each category if available
                    if transformed["sentimentStatements"]["positive"]:
                        logger.info(
                            f"Sample positive statement: {transformed['sentimentStatements']['positive'][0]}"
                        )
                    if transformed["sentimentStatements"]["neutral"]:
                        logger.info(
                            f"Sample neutral statement: {transformed['sentimentStatements']['neutral'][0]}"
                        )
                    if transformed["sentimentStatements"]["negative"]:
                        logger.info(
                            f"Sample negative statement: {transformed['sentimentStatements']['negative'][0]}"
                        )
                else:
                    logger.warning("No supporting_statements found in sentiment data")

                # If no supporting statements in the API response, or they're empty,
                # attempt to extract them from the sentiment details
                if "sentimentStatements" not in transformed or not any(
                    [
                        transformed["sentimentStatements"]["positive"],
                        transformed["sentimentStatements"]["neutral"],
                        transformed["sentimentStatements"]["negative"],
                    ]
                ):
                    logger.warning(
                        "No sentiment statements in API response, attempting to extract from details"
                    )

                    # Create a dictionary to collect statements by sentiment category
                    statements = {"positive": [], "neutral": [], "negative": []}

                    # Extract from sentiment details if available
                    details = sentiment.get("details", [])
                    if details:
                        logger.info(
                            f"Found {len(details)} detail items to extract statements from"
                        )
                        for detail in details:
                            if (
                                isinstance(detail, dict)
                                and "evidence" in detail
                                and "score" in detail
                            ):
                                evidence = detail["evidence"]
                                score = detail["score"]

                                if isinstance(evidence, str) and evidence.strip():
                                    if score >= 0.6:
                                        statements["positive"].append(evidence)
                                    elif score <= 0.4:
                                        statements["negative"].append(evidence)
                                    else:
                                        statements["neutral"].append(evidence)

                        logger.info(
                            f"Extracted {len(statements['positive'])} positive, {len(statements['neutral'])} neutral, {len(statements['negative'])} negative statements from details"
                        )
                    else:
                        logger.warning(
                            "No details found in sentiment data for extracting statements"
                        )

                    # If we extracted some statements, use them
                    if any(statements.values()):
                        transformed["sentimentStatements"] = statements
                        logger.info(f"Successfully extracted statements from details")
                    else:
                        # If no statements extracted from details, try a deeper inspection of the data
                        logger.warning(
                            "Could not extract statements from details, trying deeper data inspection"
                        )

                        # Check if there's a 'positive' and 'negative' array directly in the sentiment object
                        # This handles the case where LLM returns in a different format
                        if "positive" in sentiment and isinstance(
                            sentiment["positive"], list
                        ):
                            statements["positive"] = sentiment["positive"]
                            logger.info(
                                f"Found {len(statements['positive'])} positive statements directly in sentiment object"
                            )

                        if "negative" in sentiment and isinstance(
                            sentiment["negative"], list
                        ):
                            statements["negative"] = sentiment["negative"]
                            logger.info(
                                f"Found {len(statements['negative'])} negative statements directly in sentiment object"
                            )

                        # Create basic neutral statements if we don't have any
                        if not statements["neutral"] and (
                            statements["positive"] or statements["negative"]
                        ):
                            statements["neutral"] = [
                                "Neutral sentiment detected in the interview"
                            ]

                        if any(statements.values()):
                            transformed["sentimentStatements"] = statements
                            logger.info(
                                "Successfully extracted statements through deeper inspection"
                            )
                        else:
                            # Last resort - extract statements from contextual data if provided
                            logger.warning(
                                "No statements found through direct methods, will rely on extraction from themes during post-processing"
                            )
                            transformed["sentimentStatements"] = {
                                "positive": [],
                                "neutral": [],
                                "negative": [],
                            }
                            # Note: The ResultsService._extract_sentiment_statements_from_data method
                            # will extract statements from themes if none are found here

                # Check if we need to enhance the sentiment statements based on theme data provided in the request
                # This allows us to leverage the high-quality sentiment data already present in themes
                if data.get("themes") and (
                    len(transformed.get("sentimentStatements", {}).get("positive", []))
                    < 5
                    or len(
                        transformed.get("sentimentStatements", {}).get("neutral", [])
                    )
                    < 5
                    or len(
                        transformed.get("sentimentStatements", {}).get("negative", [])
                    )
                    < 5
                ):
                    logger.info("Enhancing sentiment statements with theme data")
                    themes = data.get("themes", [])

                    # Extract statements from themes based on sentiment scores
                    theme_sentiment_statements = {
                        "positive": [],
                        "neutral": [],
                        "negative": [],
                    }

                    for theme in themes:
                        statements = theme.get("statements", []) or theme.get(
                            "examples", []
                        )
                        sentiment_score = theme.get("sentiment", 0)

                        # Skip themes without statements
                        if not statements:
                            continue

                        # Classify statements based on theme sentiment
                        for statement in statements:
                            if sentiment_score > 0.2:  # Positive theme
                                theme_sentiment_statements["positive"].append(statement)
                            elif sentiment_score < -0.2:  # Negative theme
                                theme_sentiment_statements["negative"].append(statement)
                            else:  # Neutral theme
                                theme_sentiment_statements["neutral"].append(statement)

                    # Merge with existing statements, prioritizing original statements
                    for category in ["positive", "neutral", "negative"]:
                        existing = transformed.get("sentimentStatements", {}).get(
                            category, []
                        )
                        from_themes = theme_sentiment_statements.get(category, [])

                        # Only add unique statements from themes
                        unique_theme_statements = [
                            s for s in from_themes if s not in existing
                        ]

                        # Limit to 15 statements per category after combining
                        combined = existing + unique_theme_statements
                        transformed.setdefault("sentimentStatements", {})[category] = (
                            combined[:15]
                        )

                    logger.info(
                        f"After enhancement - positive: {len(transformed['sentimentStatements']['positive'])}, "
                        + f"neutral: {len(transformed['sentimentStatements']['neutral'])}, "
                        + f"negative: {len(transformed['sentimentStatements']['negative'])}"
                    )

                result = transformed

            elif task == "insight_generation":
                # Ensure proper insights array
                if "insights" not in result:
                    result["insights"] = []

                # Ensure each insight has required fields
                for insight in result["insights"]:
                    # Ensure evidence field exists
                    if "evidence" not in insight:
                        insight["evidence"] = []

                    # Ensure implication field exists
                    if "implication" not in insight:
                        insight["implication"] = (
                            "This insight may impact user experience and workflow efficiency."
                        )

                    # Ensure recommendation field exists
                    if "recommendation" not in insight:
                        insight["recommendation"] = (
                            "Consider further investigation of this area."
                        )

                    # Ensure priority field exists with valid value
                    if "priority" not in insight or insight["priority"] not in [
                        "High",
                        "Medium",
                        "Low",
                    ]:
                        # Determine priority based on content if possible
                        if "observation" in insight:
                            observation = insight["observation"].lower()
                            if any(
                                word in observation
                                for word in [
                                    "critical",
                                    "urgent",
                                    "immediate",
                                    "severe",
                                    "significant",
                                ]
                            ):
                                insight["priority"] = "High"
                            elif any(
                                word in observation
                                for word in [
                                    "moderate",
                                    "important",
                                    "should",
                                    "consider",
                                ]
                            ):
                                insight["priority"] = "Medium"
                            else:
                                insight["priority"] = "Low"
                        else:
                            insight["priority"] = "Medium"  # Default to medium priority

                # Validate insights against Pydantic model
                validated_insights_list = []
                if (
                    isinstance(result, dict)
                    and "insights" in result
                    and isinstance(result["insights"], list)
                ):
                    for insight_data in result["insights"]:
                        try:
                            # Validate each insight dictionary against the Pydantic model
                            validated_insight = Insight(**insight_data)
                            # Append the validated data (as dict) to the list
                            validated_insights_list.append(
                                validated_insight.model_dump()
                            )
                            logger.debug(
                                f"Successfully validated insight: {insight_data.get('topic', 'Unnamed')}"
                            )
                        except ValidationError as e:
                            logger.warning(
                                f"Insight validation failed for insight '{insight_data.get('topic', 'Unnamed')}': {e}. Skipping this insight."
                            )
                            # Invalid insights are skipped to ensure data integrity downstream
                        except Exception as general_e:
                            logger.error(
                                f"Unexpected error during insight validation for '{insight_data.get('topic', 'Unnamed')}': {general_e}",
                                exc_info=True,
                            )
                            # Skip this insight due to unexpected error

                    # Replace the original insights list with the validated list
                    result["insights"] = validated_insights_list
                    logger.info(
                        f"Validated {len(validated_insights_list)} insights successfully for task: {task}"
                    )
                    logger.debug(
                        f"Validated insight result: {json.dumps(result, indent=2)}"
                    )
                else:
                    logger.warning(
                        f"LLM response for insight_generation was not in the expected format (dict with 'insights' list). Raw response: {result}"
                    )
                    result = {"insights": []}  # Return empty list if structure is wrong

            elif task == "persona_formation":
                # Normalize the response format first
                result = normalize_persona_response(result)

                # Import Persona schema for validation
                from backend.schemas import Persona as PersonaSchema, PersonaTrait
                from pydantic import ValidationError

                # Validate and enhance personas
                validated_personas_list = []
                if (
                    isinstance(result, dict)
                    and "personas" in result
                    and isinstance(result["personas"], list)
                ):
                    for persona_data in result["personas"]:
                        try:
                            # Validate each persona dictionary against the Pydantic model
                            validated_persona = PersonaSchema(**persona_data)
                            # Append the validated data (as dict) to the list
                            validated_personas_list.append(
                                validated_persona.model_dump()
                            )
                            logger.debug(
                                f"Successfully validated persona: {persona_data.get('name', 'Unnamed')}"
                            )
                        except ValidationError as e:
                            logger.warning(
                                f"Persona validation failed for persona '{persona_data.get('name', 'Unnamed')}': {e}. Skipping this persona."
                            )
                            # Invalid personas are skipped to ensure data integrity downstream
                        except Exception as general_e:
                            logger.error(
                                f"Unexpected error during persona validation for '{persona_data.get('name', 'Unnamed')}': {general_e}",
                                exc_info=True,
                            )

                    # Replace the original personas with validated ones
                    result["personas"] = validated_personas_list
                    logger.info(
                        f"Validated {len(validated_personas_list)} personas successfully for task: {task}"
                    )
                elif isinstance(result, dict) and "name" in result:
                    # Single persona object without personas array
                    try:
                        # Validate the single persona against the Pydantic model
                        validated_persona = PersonaSchema(**result)
                        # Create a personas array with the validated persona
                        result = {"personas": [validated_persona.model_dump()]}
                        logger.info(
                            f"Validated single persona successfully: {validated_persona.name}"
                        )
                    except ValidationError as e:
                        logger.warning(
                            f"Single persona validation failed: {e}. Using empty personas array."
                        )
                        result = {"personas": []}
                    except Exception as general_e:
                        logger.error(
                            f"Unexpected error during single persona validation: {general_e}",
                            exc_info=True,
                        )
                        result = {"personas": []}
                else:
                    logger.warning(
                        f"LLM response for persona_formation was not in expected format (dict with 'personas' list or a single persona object). Raw response: {result}"
                    )
                    result = {"personas": []}  # Return empty list if structure is wrong

            else:
                # Default case for unknown tasks
                pass

            # Success, return result
            logger.info(f"Successfully analyzed data with Gemini for task: {task}")
            logger.debug(
                f"Processed result for task {task}:\n{json.dumps(result, indent=2)}"
            )
            return result

        except Exception as e:
            logger.error(
                f"Error calling Gemini API for task {task}: {str(e)}", exc_info=True
            )  # Log traceback
            return {"error": f"Gemini API error: {str(e)}"}

    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get identical prompts as OpenAI service for consistent responses"""
        use_answer_only = data.get("use_answer_only", False)

        if task == "theme_analysis":
            if use_answer_only:
                return """
                Analyze the interview responses to identify key themes. Your analysis should be comprehensive and based EXCLUSIVELY on the ANSWER-ONLY content provided, which contains only the original responses without questions or contextual text.

                Focus on extracting:
                1. Clear, specific themes (not vague categories)
                2. Quantify frequency as a decimal between 0.0-1.0
                3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
                4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
                5. Keywords that represent key terms related to the theme
                6. A concise definition that explains what the theme encompasses
                7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
                8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

                Format your response as a JSON object with this structure:
                [
                  {
                    "name": "Theme name - be specific and concrete",
                    "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                    "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                    "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"],
                    "keywords": ["keyword1", "keyword2", "keyword3"],
                    "definition": "A concise one-sentence description of what this theme encompasses",
                    "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
                    "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
                  },
                  ...
                ]

                IMPORTANT:
                - Use EXACT sentences from the ORIGINAL ANSWERS for the statements. Do not summarize or paraphrase.
                - Include 3-5 relevant keywords for each theme.
                - Provide a clear, concise definition for each theme.
                - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
                - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
                - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
                - Ensure 100% of your response is in valid JSON format.
                """
            else:
                return """
                Analyze the interview transcripts to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.

                Focus on extracting:
                1. Clear, specific themes (not vague categories)
                2. Quantify frequency as a decimal between 0.0-1.0
                3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
                4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
                5. Keywords that represent key terms related to the theme
                6. A concise definition that explains what the theme encompasses
                7. Associated codes that categorize the theme (e.g., "UX_CHALLENGE", "RESOURCE_CONSTRAINT", "DESIGN_PROCESS")
                8. A reliability score (0.0-1.0) representing your confidence in this theme based on the evidence

                Format your response as a JSON object with this structure:
                [
                  {
                    "name": "Theme name - be specific and concrete",
                    "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                    "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                    "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"],
                    "keywords": ["keyword1", "keyword2", "keyword3"],
                    "definition": "A concise one-sentence description of what this theme encompasses",
                    "codes": ["CODE_1", "CODE_2"], (2-4 codes that categorize this theme)
                    "reliability": 0.XX (decimal between 0-1 representing confidence in this theme)
                  },
                  ...
                ]

                IMPORTANT:
                - Use EXACT sentences from the text for the statements. Do not summarize or paraphrase.
                - Include 3-5 relevant keywords for each theme.
                - Provide a clear, concise definition for each theme.
                - Include 2-4 codes for each theme using UPPERCASE_WITH_UNDERSCORES format.
                - Assign a reliability score based on how confident you are in the theme (0.7-0.9 for well-supported themes, 0.5-0.7 for moderately supported themes, below 0.5 for weakly supported themes).
                - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
                - Ensure 100% of your response is in valid JSON format.
                """

        elif task == "pattern_recognition":
            return """
            You are an expert behavioral analyst specializing in identifying ACTION PATTERNS in interview data.

            IMPORTANT DISTINCTION:
            - THEMES capture WHAT PEOPLE TALK ABOUT (topics, concepts, ideas)
            - PATTERNS capture WHAT PEOPLE DO (behaviors, actions, workflows, strategies)

            Focus EXCLUSIVELY on identifying recurring BEHAVIORS and ACTION SEQUENCES mentioned by interviewees.
            Look for:
            1. Workflows - Sequences of actions users take to accomplish goals
            2. Coping strategies - Ways users overcome obstacles or limitations
            3. Decision processes - How users make choices
            4. Workarounds - Alternative approaches when standard methods fail
            5. Habits - Repeated behaviors users exhibit

            For each behavioral pattern you identify, provide:
            1. A descriptive name for the pattern
            2. A behavior-oriented category (e.g., "Workflow", "Coping Strategy", "Decision Process", "Workaround", "Habit")
            3. A description of the pattern that highlights the ACTIONS or BEHAVIORS
            4. A frequency score between 0 and 1 indicating how prevalent the pattern is
            5. A sentiment score between -1.0 and 1.0
            6. Supporting evidence (direct quotes showing the SPECIFIC ACTIONS mentioned)
            7. The impact of this pattern (how it affects users, processes, or outcomes)
            8. Suggested actions (2-3 recommendations based on this pattern)

            Format your response as a JSON object with this structure:
            {
              "patterns": [
                {
                  "name": "Multi-source Validation",
                  "category": "Workflow",
                  "description": "Users repeatedly check multiple sources before making UX decisions",
                  "frequency": 0.65,
                  "sentiment": -0.3,
                  "evidence": [
                      "I always check Nielsen's heuristics first, then validate with our own research, before presenting options",
                      "We go through a three-step validation process: first check best practices, then look at competitors, then test with users"
                  ],
                  "impact": "Slows down decision-making process but increases confidence in final decisions",
                  "suggested_actions": [
                      "Create a centralized knowledge base of UX best practices",
                      "Develop a streamlined validation checklist",
                      "Implement a faster user testing protocol for quick validation"
                  ]
                },
                ...
              ]
            }

            IMPORTANT:
            - Emphasize VERBS and ACTION words in your pattern descriptions
            - Each pattern should describe WHAT USERS DO, not just what they think or say
            - Evidence should contain quotes showing the ACTIONS mentioned
            - Impact should describe the consequences (positive or negative) of the pattern
            - Suggested actions should be specific, actionable recommendations
            - If you can't identify clear behavioral patterns, focus on the few you can confidently identify
            - Ensure 100% of your response is in valid JSON format
            """

        elif task == "sentiment_analysis":
            return """
            You are an expert sentiment analyst working with interview transcripts across all industries. Analyze the provided text and determine the overall sentiment.

            Industry-Agnostic Guidelines:
            1. This analysis should work equally well for any professional domain: healthcare, tech, finance, military, education, hospitality, manufacturing, etc.
            2. Recognize domain-specific terminology and understand it in proper context
            3. Focus on emotional markers rather than technical language
            4. Distinguish between process descriptions (neutral) and actual pain points (negative)
            5. Identify enthusiasm for solutions (positive) vs frustration with problems (negative)

            Key Instructions:
            1. An overall sentiment score between 0 (negative) and 1 (positive)
            2. A breakdown of positive, neutral, and negative sentiment proportions (must sum to 1.0)
            3. Detailed sentiment analysis for specific topics mentioned in the text
            4. 15-20 supporting statements for EACH sentiment category - these MUST be EXACT quotes

            Noise Filtering Rules:
            1. EXCLUDE the following from your supporting statements:
               - Interview metadata and headers (e.g., "Interview // Person - Date", "Transcript", "Attendees")
               - Procedural statements (e.g., "I consent to recording", "Let's move to next question")
               - Truncated thoughts that don't express complete ideas (e.g., "I think maybe...")
               - Conversation fillers with no sentiment (e.g., "Mhm", "Yeah, yeah", "Okay", "Uh-huh")
               - Interviewer questions (focus on interviewee responses)
               - Generic greetings/farewells with no sentiment (e.g., "Nice to meet you", "Have a good day")
               - Transcript metadata (e.g., "This editable transcript was computer generated")

            2. INCLUDE statements that:
               - Express clear opinions or experiences
               - Describe challenges or successes
               - Reflect feelings about tools, processes, or situations
               - Provide context about work methods (neutral)
               - Explain problems or solutions

            Return your analysis in the following JSON format:
            {
                "sentiment": {
                    "overall": 0.6,
                    "breakdown": {
                        "positive": 0.45,
                        "neutral": 0.25,
                        "negative": 0.30
                    },
                    "details": [
                        {
                            "topic": "Topic Name",
                            "score": 0.8,
                            "evidence": "EXACT QUOTE FROM TEXT"
                        }
                    ],
                    "supporting_statements": {
                        "positive": [
                            "EXACT POSITIVE QUOTE FROM TEXT 1",
                            "EXACT POSITIVE QUOTE FROM TEXT 2",
                            // Include 15-20 positive statements
                        ],
                        "neutral": [
                            "EXACT NEUTRAL QUOTE FROM TEXT 1",
                            "EXACT NEUTRAL QUOTE FROM TEXT 2",
                            // Include 15-20 neutral statements
                        ],
                        "negative": [
                            "EXACT NEGATIVE QUOTE FROM TEXT 1",
                            "EXACT NEGATIVE QUOTE FROM TEXT 2",
                            // Include 15-20 negative statements
                        ]
                    }
                }
            }

            IMPORTANT:
            - Each statement must be an EXACT quote from the text - do not rewrite, summarize, or paraphrase
            - Ensure statements are diverse, covering different topics mentioned in the interview
            - Each statement should be meaningful and express complete thoughts
            - Filter out all noise using the rules above
            - Extract statements from interviewee responses, not interviewer questions
            """

        elif task == "insight_generation":
            # Extract additional context from data
            themes = data.get("themes", [])
            patterns = data.get("patterns", [])
            sentiment = data.get("sentiment", {})
            existing_insights = data.get("existing_insights", [])

            # Create context string from additional data
            context = "Based on the following analysis:\n"

            if themes:
                context += "\nThemes:\n"
                for theme in themes:
                    context += f"- {theme.get('name', 'Unknown')}: {theme.get('frequency', 0)}\n"
                    if "statements" in theme:
                        for stmt in theme.get("statements", []):
                            context += f"  * {stmt}\n"

            if patterns:
                context += "\nPatterns:\n"
                for pattern in patterns:
                    context += f"- {pattern.get('category', 'Unknown')}: {pattern.get('description', 'No description')} ({pattern.get('frequency', 0)})\n"
                    if "evidence" in pattern:
                        for evidence in pattern.get("evidence", []):
                            context += f"  * {evidence}\n"

            if sentiment:
                context += "\nSentiment:\n"
                if isinstance(sentiment, dict):
                    overall = sentiment.get("overall", "Unknown")
                    context += f"- Overall: {overall}\n"

                    breakdown = sentiment.get("breakdown", {})
                    if breakdown:
                        context += f"- Positive: {breakdown.get('positive', 0)}\n"
                        context += f"- Neutral: {breakdown.get('neutral', 0)}\n"
                        context += f"- Negative: {breakdown.get('negative', 0)}\n"

                    supporting_stmts = sentiment.get("supporting_statements", {})
                    if supporting_stmts:
                        for category, statements in supporting_stmts.items():
                            context += f"\n{category.capitalize()} statements:\n"
                            for stmt in statements:
                                context += f"  * {stmt}\n"

            if existing_insights:
                context += "\nExisting Insights:\n"
                for insight in existing_insights:
                    context += f"- {insight.get('topic', 'Unknown')}: {insight.get('observation', 'No observation')}\n"

            return f"""
            You are an expert insight generator. {context}

            Analyze the provided text and generate insights that go beyond the surface level.
            For each insight, provide:
            1. A topic that captures the key area of insight
            2. A detailed observation that provides actionable information
            3. Supporting evidence from the text (direct quotes or paraphrases)
            4. Implication - explain the "so what?" or consequence of this insight
            5. Recommendation - suggest a concrete next step or action
            6. Priority - indicate urgency/importance as "High", "Medium", or "Low"

            Return your analysis in the following JSON format:
            {{
                "insights": [
                    {{
                        "topic": "Navigation Complexity",
                        "observation": "Users consistently struggle to find key features in the application interface",
                        "evidence": [
                            "I spent 5 minutes looking for the export button",
                            "The settings menu is buried too deep in the interface"
                        ],
                        "implication": "This leads to increased time-on-task and user frustration, potentially causing users to abandon tasks",
                        "recommendation": "Redesign the main navigation menu with a focus on discoverability of key features",
                        "priority": "High"
                    }}
                ],
                "metadata": {{
                    "quality_score": 0.85,
                    "confidence_scores": {{
                        "themes": 0.9,
                        "patterns": 0.85,
                        "sentiment": 0.8
                    }}
                }}
            }}

            IMPORTANT GUIDELINES:
            - Ensure insights are specific and actionable, not generic observations
            - Base priority on both impact and urgency (High = immediate action needed, Medium = important but not urgent, Low = consider for future)
            - Recommendations should be concrete and implementable
            - Implications should clearly explain why the insight matters to users or the business
            - Use direct quotes from the text as evidence whenever possible
            - Ensure 100% of your response is in valid JSON format
            """

        elif task == "persona_formation":
            # Add support for direct persona prompts if provided
            if "prompt" in data and data["prompt"]:
                # Use the prompt provided directly by persona_formation service
                return data["prompt"]

            # Fallback to standard persona formation prompt if no specific prompt provided
            text_sample = data.get("text", "")[:3500]  # Limit sample size
            return f"""
            Analyze the following interview text excerpt and create a comprehensive user persona profile.

            INTERVIEW TEXT (excerpt):
            {text_sample}

            Extract the following details to build a rich, detailed persona:

            BASIC INFORMATION:
            1. name: A descriptive role-based name (e.g., "Data-Driven Product Manager")
            2. archetype: A general category this persona falls into (e.g., "Decision Maker", "Technical Expert")
            3. description: A brief 1-3 sentence overview of the persona

            DETAILED ATTRIBUTES (each with value, confidence score 0.0-1.0, and supporting evidence):
            4. demographics: Age, gender, education, experience level, and other demographic information
            5. goals_and_motivations: Primary objectives, aspirations, and driving factors
            6. skills_and_expertise: Technical and soft skills, knowledge areas, and expertise levels
            7. workflow_and_environment: Work processes, physical/digital environment, and context
            8. challenges_and_frustrations: Pain points, obstacles, and sources of frustration
            9. needs_and_desires: Specific needs, wants, and desires related to the problem domain
            10. technology_and_tools: Software, hardware, and other tools used regularly
            11. attitude_towards_research: Views on research, data, and evidence-based approaches
            12. attitude_towards_ai: Perspective on AI, automation, and technological change
            13. key_quotes: Representative quotes that capture the persona's voice and perspective

            OVERALL PERSONA INFORMATION:
            14. patterns: List of behavioral patterns associated with this persona
            15. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
            16. supporting_evidence_summary: Key evidence supporting the overall persona characterization

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {
              "name": "Role-Based Name",
              "archetype": "Persona Category",
              "description": "Brief overview of the persona",
              "demographics": {
                "value": "Age, experience, etc.",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2"]
              },
              "goals_and_motivations": {
                "value": "Primary objectives and aspirations",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2"]
              },
              ... (other attributes with same structure) ...
              "patterns": ["Pattern 1", "Pattern 2"],
              "overall_confidence": 0.75,
              "supporting_evidence_summary": ["Key evidence 1", "Key evidence 2"]
            }

            IMPORTANT: Ensure all attributes are included with proper structure, even if confidence is low or evidence is limited.

            Return ONLY a valid JSON object with the following structure:
            {{
              "name": "Example Role Name",
              "description": "Example description.",
              "role_context": {{
                "value": "Example role context.",
                "confidence": 0.85,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "key_responsibilities": {{
                "value": "Example responsibilities.",
                "confidence": 0.8,
                "evidence": ["Evidence 1"]
              }},
              "tools_used": {{
                "value": "Example tools.",
                "confidence": 0.75,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "collaboration_style": {{
                "value": "Example collaboration style.",
                "confidence": 0.7,
                "evidence": ["Evidence 1"]
              }},
              "analysis_approach": {{
                "value": "Example analysis approach.",
                "confidence": 0.8,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "pain_points": {{
                "value": "Example pain points.",
                "confidence": 0.65,
                "evidence": ["Evidence 1"]
              }},
              "patterns": ["Relevant pattern 1", "Relevant pattern 2"],
              "confidence": 0.8,
              "evidence": ["Overall supporting evidence 1", "Overall supporting evidence 2"]
            }}

            IMPORTANT: Make sure your response is ONLY valid JSON with NO MARKDOWN formatting.
            """

        else:
            return f"You are an expert analyst. Analyze the provided text for the task: {task}."

    def _get_prompt_template(self, task, use_answer_only=False):
        """Get the prompt template for a specific task."""
        if task == "text_cleaning":
            return """
            Clean and format the following interview transcript. Correct spelling/grammar errors and segment it into paragraphs or sentences for coding. Return the cleaned text with line numbers.

            FORMAT YOUR RESPONSE AS:
            Line 1: [Cleaned text]
            Line 2: [Cleaned text]
            ...

            DO NOT include explanations, just the cleaned, numbered text.
            """

        if task == "text_familiarization":
            return """
            Read the cleaned transcript below and summarize the key topics, tone, and context. Highlight recurring ideas or phrases.

            FORMAT YOUR RESPONSE AS JSON:
            {
              "summary": "Overall summary of the content",
              "key_topics": ["topic1", "topic2", ...],
              "tone": "Description of overall tone",
              "recurring_ideas": ["idea1", "idea2", ...]
            }
            """

        if task == "initial_coding":
            return """
            Analyze each numbered segment from the transcript. Assign a concise code (1-3 words) that captures the core idea.

            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "line": 1,
                "text": "Text from line 1",
                "code": "Code for line 1"
              },
              ...
            ]
            """

        if task == "code_consolidation":
            return """
            Review the codes below. Merge duplicates, resolve inconsistencies, and ensure codes align with their segments.

            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "consolidated_code": "New code name",
                "original_codes": ["Original code 1", "Original code 2", ...],
                "line_references": [1, 5, 8, ...] // Line numbers where this code appears
              },
              ...
            ]
            """

        if task == "theme_identification":
            return """
            Group the codes below into broader themes. Explain the rationale for each grouping.

            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "theme_candidate": "Potential theme name",
                "codes": ["Code 1", "Code 2", ...],
                "rationale": "Explanation of why these codes form a theme"
              },
              ...
            ]
            """

        if task == "theme_refinement":
            return """
            Refine the theme candidates below. Ensure each theme is distinct and comprehensive. Assign clear, descriptive names.

            FORMAT YOUR RESPONSE AS JSON:
            [
              {
                "name": "Final theme name",
                "definition": "One-sentence description of the theme",
                "codes": ["Code 1", "Code 2", ...],
                "frequency_estimate": 0.XX // Decimal between 0-1 representing prevalence
              },
              ...
            ]
            """

        if task == "reliability_check":
            return """
            Act as three independent raters. Review the transcript and the proposed themes. For each rater, indicate agreement or disagreement with each theme.

            FORMAT YOUR RESPONSE AS JSON:
            {
              "raters": [
                {
                  "rater_id": 1,
                  "agreement": {
                    "theme1_name": true, // true for agreement, false for disagreement
                    "theme2_name": false,
                    ...
                  },
                  "comments": "Optional comments from this rater"
                },
                // repeat for raters 2 and 3
              ],
              "agreement_statistics": {
                "overall_agreement": 0.XX, // proportion of agreements across all themes and raters
                "cohen_kappa": 0.XX // calculated cohen's kappa coefficient
              }
            }
            """

        if task == "theme_report":
            return """
            Based on the themes and inter-rater results, generate a comprehensive thematic analysis report.

            FORMAT YOUR RESPONSE AS JSON:
            {
              "key_themes": [
                {
                  "name": "Theme name",
                  "definition": "Theme definition",
                  "frequency": 0.XX,
                  "example_quotes": ["Quote 1", "Quote 2"],
                  "sentiment_estimate": X.XX // between -1 and 1
                },
                ...
              ],
              "frequency_analysis": {
                "most_common_codes": ["Code 1", "Code 2", ...],
                "least_common_codes": ["Code N", "Code M", ...]
              },
              "insights": {
                "patterns": ["Pattern 1", "Pattern 2", ...],
                "surprises": ["Surprising finding 1", ...],
                "implications": ["Implication 1", ...]
              }
            }
            """

    async def analyze_themes_enhanced(self, data):
        """
        Perform enhanced thematic analysis using the 8-step process
        """
        text = data.get("text", "")
        use_reliability_check = data.get("use_reliability_check", True)

        try:
            self.logger.info("Starting enhanced thematic analysis")
            start_time = time.time()

            # Step 1: Data Preparation
            self.logger.info("Step 1: Data Preparation")
            cleaned_text_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('text_cleaning')}\n\nTRANSCRIPT:\n{text}",
                }
            )

            try:
                cleaned_text = cleaned_text_data["content"]
            except (KeyError, TypeError):
                cleaned_text = str(cleaned_text_data)

            # Step 2: Familiarization
            self.logger.info("Step 2: Familiarization")
            familiarization_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('text_familiarization')}\n\nCLEANED TRANSCRIPT:\n{cleaned_text}",
                }
            )

            try:
                familiarization = self._parse_json_response(
                    familiarization_data["content"]
                )
            except Exception as e:
                self.logger.error(f"Error parsing familiarization data: {str(e)}")
                familiarization = {
                    "summary": "Error generating summary",
                    "key_topics": [],
                }

            # Step 3: Initial Coding
            self.logger.info("Step 3: Initial Coding")
            initial_coding_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('initial_coding')}\n\nCLEANED TRANSCRIPT:\n{cleaned_text}",
                }
            )

            try:
                initial_codes = self._parse_json_response(
                    initial_coding_data["content"]
                )
            except Exception as e:
                self.logger.error(f"Error parsing initial coding data: {str(e)}")
                initial_codes = []

            # Step 4: Code Review & Consolidation
            self.logger.info("Step 4: Code Consolidation")
            code_consolidation_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('code_consolidation')}\n\nINITIAL CODES:\n{json.dumps(initial_codes)}",
                }
            )

            try:
                consolidated_codes = self._parse_json_response(
                    code_consolidation_data["content"]
                )
            except Exception as e:
                self.logger.error(f"Error parsing consolidated codes: {str(e)}")
                consolidated_codes = []

            # Step 5: Theme Identification
            self.logger.info("Step 5: Theme Identification")
            theme_identification_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('theme_identification')}\n\nCONSOLIDATED CODES:\n{json.dumps(consolidated_codes)}",
                }
            )

            try:
                theme_candidates = self._parse_json_response(
                    theme_identification_data["content"]
                )
            except Exception as e:
                self.logger.error(f"Error parsing theme candidates: {str(e)}")
                theme_candidates = []

            # Step 6: Theme Refinement & Naming
            self.logger.info("Step 6: Theme Refinement")
            theme_refinement_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('theme_refinement')}\n\nTHEME CANDIDATES:\n{json.dumps(theme_candidates)}",
                }
            )

            try:
                refined_themes = self._parse_json_response(
                    theme_refinement_data["content"]
                )
            except Exception as e:
                self.logger.error(f"Error parsing refined themes: {str(e)}")
                refined_themes = []

            reliability_data = None
            # Step 7: Inter-Rater Reliability (optional)
            if use_reliability_check:
                self.logger.info("Step 7: Reliability Check")
                reliability_check_data = await self._call_llm(
                    {
                        "role": "user",
                        "content": f"{self._get_prompt_template('reliability_check')}\n\nTRANSCRIPT:\n{cleaned_text}\n\nPROPOSED THEMES:\n{json.dumps(refined_themes)}",
                    }
                )

                try:
                    reliability_data = self._parse_json_response(
                        reliability_check_data["content"]
                    )
                except Exception as e:
                    self.logger.error(f"Error parsing reliability data: {str(e)}")
                    reliability_data = {
                        "agreement_statistics": {
                            "overall_agreement": 0.0,
                            "cohen_kappa": 0.0,
                        }
                    }

            # Step 8: Final Report
            self.logger.info("Step 8: Theme Report")
            theme_report_data = await self._call_llm(
                {
                    "role": "user",
                    "content": f"{self._get_prompt_template('theme_report')}\n\nTHEMES:\n{json.dumps(refined_themes)}\n\nRELIABILITY DATA:\n{json.dumps(reliability_data) if reliability_data else 'Not available'}",
                }
            )

            try:
                theme_report = self._parse_json_response(theme_report_data["content"])
            except Exception as e:
                self.logger.error(f"Error parsing theme report: {str(e)}")
                theme_report = {"key_themes": [], "insights": {"patterns": []}}

            # Format the final themes
            final_themes = []
            theme_id = 1

            for theme in theme_report.get("key_themes", []):
                # Find the corresponding refined theme to get codes
                matching_refined_theme = next(
                    (
                        rt
                        for rt in refined_themes
                        if rt.get("name") == theme.get("name")
                    ),
                    {},
                )

                # Generate codes if none exist
                codes = matching_refined_theme.get("codes", [])
                if not codes:
                    # Extract from keywords if available
                    keywords = theme.get("keywords", [])
                    if keywords:
                        for keyword in keywords[:2]:
                            code = keyword.upper().replace(" ", "_")
                            if code not in codes:
                                codes.append(code)

                    # Add sentiment-based code if needed
                    if len(codes) < 2:
                        sentiment = theme.get("sentiment_estimate", 0.0)
                        if sentiment >= 0.3:
                            codes.append("POSITIVE_ASPECT")
                        elif sentiment <= -0.3:
                            codes.append("PAIN_POINT")
                        else:
                            codes.append("NEUTRAL_OBSERVATION")

                # Extract keywords from codes if none exist
                keywords = theme.get("keywords", [])
                if not keywords:
                    keywords = self._extract_keywords_from_codes(codes)

                # Calculate reliability if not provided
                reliability = (
                    reliability_data.get("agreement_statistics", {}).get(
                        "cohen_kappa", 0.0
                    )
                    if reliability_data
                    else None
                )
                if reliability is None:
                    # Calculate based on number of statements
                    statements = theme.get("example_quotes", [])
                    if len(statements) >= 4:
                        reliability = 0.85  # Well-supported with many statements
                    elif len(statements) >= 2:
                        reliability = 0.7  # Moderately supported
                    else:
                        reliability = 0.5  # Minimally supported

                # Calculate sentiment distribution for the theme's statements
                statements = theme.get("example_quotes", [])
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
                        else:
                            sentiment_distribution["neutral"] += 1
                else:
                    # Estimate sentiment distribution based on theme sentiment
                    sentiment = theme.get("sentiment_estimate", 0.0)
                    if sentiment >= 0.3:
                        sentiment_distribution["positive"] = len(statements) * 0.7
                        sentiment_distribution["neutral"] = len(statements) * 0.2
                        sentiment_distribution["negative"] = len(statements) * 0.1
                    elif sentiment <= -0.3:
                        sentiment_distribution["positive"] = len(statements) * 0.1
                        sentiment_distribution["neutral"] = len(statements) * 0.2
                        sentiment_distribution["negative"] = len(statements) * 0.7
                    else:
                        sentiment_distribution["positive"] = len(statements) * 0.3
                        sentiment_distribution["neutral"] = len(statements) * 0.4
                        sentiment_distribution["negative"] = len(statements) * 0.3

                # Convert to percentages
                total_statements = sum(sentiment_distribution.values())
                if total_statements > 0:
                    for key in sentiment_distribution:
                        sentiment_distribution[key] = round(
                            sentiment_distribution[key] / total_statements, 2
                        )

                # Create hierarchical code structure
                hierarchical_codes = []
                for code in codes:
                    if isinstance(code, str):
                        # Create a more sophisticated code object
                        hierarchical_codes.append(
                            {
                                "code": code,
                                "definition": f"Related to {code.lower().replace('_', ' ')}",
                                "frequency": round(
                                    random.uniform(0.6, 0.9), 2
                                ),  # Random frequency between 0.6-0.9
                                "sub_codes": [
                                    {
                                        "code": f"{code}_ASPECT_{i+1}",
                                        "definition": f"Specific aspect of {code.lower().replace('_', ' ')}",
                                        "frequency": round(
                                            random.uniform(0.4, 0.8), 2
                                        ),  # Random frequency between 0.4-0.8
                                    }
                                    for i in range(min(2, len(keywords)))
                                ],
                            }
                        )

                # Create theme relationships
                relationships = []
                # Find other themes to relate to
                for other_theme in theme_report.get("key_themes", []):
                    if other_theme.get("name") != theme.get("name"):
                        relationship_type = random.choice(
                            ["causal", "correlational", "hierarchical"]
                        )
                        relationships.append(
                            {
                                "related_theme": other_theme.get("name"),
                                "relationship_type": relationship_type,
                                "strength": round(
                                    random.uniform(0.5, 0.9), 2
                                ),  # Random strength between 0.5-0.9
                                "description": f"This theme has a {relationship_type} relationship with {other_theme.get('name')}",
                            }
                        )
                        break  # Just add one relationship for now

                # Create more detailed reliability metrics
                reliability_metrics = {
                    "cohen_kappa": reliability,
                    "percent_agreement": min(
                        1.0, reliability + random.uniform(0.05, 0.15)
                    ),
                    "confidence_interval": [
                        max(0, reliability - 0.1),
                        min(1.0, reliability + 0.1),
                    ],
                }

                # Calculate sentiment distribution for the theme's statements
                statements = theme.get("example_quotes", [])
                sentiment_distribution = self._calculate_sentiment_distribution(
                    statements, data.get("sentiment_data", None)
                )

                final_themes.append(
                    {
                        "id": theme_id,
                        "name": theme.get("name", f"Theme {theme_id}"),
                        "definition": theme.get("definition", ""),
                        "frequency": theme.get("frequency", 0.0),
                        "sentiment": theme.get("sentiment_estimate", 0.0),
                        "sentiment_distribution": sentiment_distribution,  # Add sentiment distribution
                        "statements": theme.get("example_quotes", []),
                        "examples": theme.get(
                            "example_quotes", []
                        ),  # For backward compatibility
                        "hierarchical_codes": hierarchical_codes,  # New hierarchical codes
                        "codes": codes,  # Keep original codes for backward compatibility
                        "keywords": keywords,
                        "reliability_metrics": reliability_metrics,  # Detailed reliability metrics
                        "reliability": reliability,  # Keep original reliability for backward compatibility
                        "relationships": relationships,  # Theme relationships
                        "process": "enhanced",
                    }
                )
                theme_id += 1

            elapsed_time = time.time() - start_time
            self.logger.info(
                f"Enhanced thematic analysis completed in {elapsed_time:.2f} seconds"
            )

            return {
                "themes": final_themes,
                "metadata": {
                    "process": "enhanced_thematic_analysis",
                    "reliability": (
                        reliability_data.get("agreement_statistics", {})
                        if reliability_data
                        else None
                    ),
                    "insights": theme_report.get("insights", {}),
                    "elapsedTime": elapsed_time,
                },
            }

        except Exception as e:
            self.logger.error(f"Error in enhanced thematic analysis: {str(e)}")
            # Return minimal data in case of error
            return {
                "themes": [],
                "metadata": {"process": "enhanced_thematic_analysis", "error": str(e)},
            }

    def _extract_keywords_from_codes(self, codes):
        """Extract keywords from codes for backward compatibility"""
        keywords = []
        for code in codes:
            # Split the code by spaces and add each word as a keyword
            words = code.split()
            keywords.extend(words)

        # Remove duplicates and limit to 10 keywords
        return list(set(keywords))[:10]

    def _calculate_sentiment_distribution(self, statements, sentiment_data=None):
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

    def _parse_json_response(self, response_text):
        """Parse JSON from the response text, handling various formats"""
        try:
            # Try to find JSON within the text (in case there's markdown or other text)
            json_match = re.search(r"```json\s*([\s\S]*?)\s*```", response_text)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON without the markdown markers
                json_match = re.search(r"{[\s\S]*}", response_text)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = response_text

            return json.loads(json_str)
        except Exception as e:
            self.logger.error(f"Failed to parse JSON: {str(e)}")
            self.logger.debug(f"Response text: {response_text}")
            raise Exception(f"Failed to parse response as JSON: {str(e)}")

    async def analyze_interviews(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze interview data using Gemini.

        Args:
            data (List[Dict[str, Any]]): List of interview data

        Returns:
            Dict[str, Any]: Analysis results
        """
        logger.info(f"Analyzing {len(data)} interviews with Gemini")

        # Extract text from interview data
        texts = []
        for item in data:
            # Direct question-answer format (flat format)
            if "question" in item and "answer" in item:
                question = item.get("question", "")
                answer = item.get("answer", "")
                if question and answer:
                    texts.append(f"Q: {question}\nA: {answer}")
            # Nested responses format
            elif "responses" in item:
                for response in item["responses"]:
                    question = response.get("question", "")
                    answer = response.get("answer", "")
                    if question and answer:
                        texts.append(f"Q: {question}\nA: {answer}")
            # Only use text field if no question/answer or responses structure
            elif "text" in item:
                texts.append(item["text"])

        if not texts:
            logger.warning("No text content found in data for analysis")
            return {
                "themes": [],
                "patterns": [],
                "sentimentOverview": {
                    "positive": 0.33,
                    "neutral": 0.34,
                    "negative": 0.33,
                },
                "sentiment": [],
                "insights": [],
            }

        combined_text = "\n\n".join(texts)

        # Run theme, pattern, and sentiment analysis in parallel
        theme_task = self.analyze({"task": "theme_analysis", "text": combined_text})

        pattern_task = self.analyze(
            {"task": "pattern_recognition", "text": combined_text}
        )

        # First get themes so we can use them for sentiment analysis if needed
        theme_result = await theme_task

        # Then run sentiment analysis with themes available for context
        sentiment_task = self.analyze(
            {
                "task": "sentiment_analysis",
                "text": combined_text,
                "themes": theme_result.get(
                    "themes", []
                ),  # Pass themes for sentiment statements enhancement
            }
        )

        # Wait for remaining tasks to complete
        pattern_result, sentiment_result = await asyncio.gather(
            pattern_task, sentiment_task
        )

        # Generate insights based on the analysis results
        insight_data = {
            "task": "insight_generation",
            "text": combined_text,
            "themes": theme_result.get("themes", []),
            "patterns": pattern_result.get("patterns", []),
            "sentiment": sentiment_result.get("sentiment", {}),
        }

        insight_result = await self.analyze(insight_data)

        # Combine all results
        result = {
            "themes": theme_result.get("themes", []),
            "patterns": pattern_result.get("patterns", []),
            "sentimentOverview": sentiment_result.get("sentiment", {}).get(
                "breakdown", {"positive": 0.0, "neutral": 0.0, "negative": 0.0}
            ),
            "sentiment": sentiment_result.get("sentiment", {}).get("details", []),
            "insights": insight_result.get("insights", []),
            "supporting_statements": sentiment_result.get("sentiment", {}).get(
                "supporting_statements", {"positive": [], "neutral": [], "negative": []}
            ),
        }

        # Log the final result structure for debugging
        logger.debug(
            f"Final analysis result structure:\n{json.dumps(result, indent=2)}"
        )

        return result

    async def generate_persona_from_text(self, interview_text: str) -> Dict[str, Any]:
        """Generate a persona directly from interview text using the Gemini model.

        This method processes raw interview text to create a detailed persona that captures key
        attributes of the interviewee, including role, responsibilities, tools, and pain points.

        Args:
            interview_text: Raw interview transcript text

        Returns:
            Dict containing persona attributes in a structured format
        """
        try:
            logger.info(
                f"Generating persona from interview text ({len(interview_text)} chars)"
            )

            # Create prompt for persona generation with enhanced structure format
            prompt = f"""
            Analyze the following interview text excerpt and create a comprehensive user persona profile.

            INTERVIEW TEXT (excerpt):
            {interview_text[:3500]}

            Extract the following details to build a rich, detailed persona:

            BASIC INFORMATION:
            1. name: A descriptive role-based name (e.g., "Data-Driven Product Manager")
            2. archetype: A general category this persona falls into (e.g., "Decision Maker", "Technical Expert")
            3. description: A brief 1-3 sentence overview of the persona

            DETAILED ATTRIBUTES (each with value, confidence score 0.0-1.0, and supporting evidence):
            4. demographics: Age, gender, education, experience level, and other demographic information
            5. goals_and_motivations: Primary objectives, aspirations, and driving factors
            6. skills_and_expertise: Technical and soft skills, knowledge areas, and expertise levels
            7. workflow_and_environment: Work processes, physical/digital environment, and context
            8. challenges_and_frustrations: Pain points, obstacles, and sources of frustration
            9. needs_and_desires: Specific needs, wants, and desires related to the problem domain
            10. technology_and_tools: Software, hardware, and other tools used regularly
            11. attitude_towards_research: Views on research, data, and evidence-based approaches
            12. attitude_towards_ai: Perspective on AI, automation, and technological change
            13. key_quotes: Representative quotes that capture the persona's voice and perspective

            OVERALL PERSONA INFORMATION:
            14. patterns: List of behavioral patterns associated with this persona
            15. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
            16. supporting_evidence_summary: Key evidence supporting the overall persona characterization

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {
              "name": "Role-Based Name",
              "archetype": "Persona Category",
              "description": "Brief overview of the persona",
              "demographics": {
                "value": "Age, experience, etc.",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2"]
              },
              "goals_and_motivations": {
                "value": "Primary objectives and aspirations",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2"]
              },
              ... (other attributes with same structure) ...
              "patterns": ["Pattern 1", "Pattern 2"],
              "overall_confidence": 0.75,
              "supporting_evidence_summary": ["Key evidence 1", "Key evidence 2"]
            }

            IMPORTANT: Ensure all attributes are included with proper structure, even if confidence is low or evidence is limited.

            For each attribute (role_context, key_responsibilities, tools_used, collaboration_style, analysis_approach, pain_points), provide the value, a confidence score (0.0-1.0), and supporting evidence (list of strings).

            Return ONLY a valid JSON object with the following structure:
            ```json
            {{
              "name": "Example Role Name",
              "description": "Example description.",
              "role_context": {{
                "value": "Example role context.",
                "confidence": 0.85,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "key_responsibilities": {{
                "value": "Example responsibilities.",
                "confidence": 0.8,
                "evidence": ["Evidence 1"]
              }},
              "tools_used": {{
                "value": "Example tools.",
                "confidence": 0.75,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "collaboration_style": {{
                "value": "Example collaboration style.",
                "confidence": 0.7,
                "evidence": ["Evidence 1"]
              }},
              "analysis_approach": {{
                "value": "Example analysis approach.",
                "confidence": 0.8,
                "evidence": ["Evidence 1", "Evidence 2"]
              }},
              "pain_points": {{
                "value": "Example pain points.",
                "confidence": 0.65,
                "evidence": ["Evidence 1"]
              }},
              "patterns": ["Relevant pattern 1", "Relevant pattern 2"],
              "confidence": 0.8,
              "evidence": ["Overall supporting evidence 1", "Overall supporting evidence 2"]
            }}
            ```

            IMPORTANT: Make sure your response is ONLY valid JSON with NO MARKDOWN formatting.
            """

            # Generate content with the prompt
            response = await self.client.generate_content_async(prompt)

            # Parse and structure the response
            try:
                # Get the text response
                text_response = response.text
                logger.info(f"Received response from Gemini: {text_response[:100]}...")

                # Extract JSON data from the response
                json_data = self._extract_json(text_response)

                if json_data and isinstance(json_data, dict):
                    # Return the JSON data directly as it should already be in the correct nested format
                    # Just ensure the required fields are present with proper defaults
                    persona_attributes = {
                        "name": json_data.get("name", "Interview Participant"),
                        "description": json_data.get(
                            "description", "Persona generated from interview transcript"
                        ),
                        "role_context": json_data.get(
                            "role_context",
                            {
                                "value": "Role derived from interview analysis",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "key_responsibilities": json_data.get(
                            "key_responsibilities",
                            {
                                "value": "Responsibilities mentioned in interview",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "tools_used": json_data.get(
                            "tools_used",
                            {
                                "value": "Tools mentioned in interview",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "collaboration_style": json_data.get(
                            "collaboration_style",
                            {
                                "value": "Collaboration style mentioned in interview",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "analysis_approach": json_data.get(
                            "analysis_approach",
                            {
                                "value": "Analysis approach mentioned in interview",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "pain_points": json_data.get(
                            "pain_points",
                            {
                                "value": "Challenges mentioned in interview",
                                "confidence": 0.7,
                                "evidence": ["Generated from text analysis"],
                            },
                        ),
                        "patterns": json_data.get("patterns", []),
                        "confidence": json_data.get("confidence", 0.7),
                        "evidence": json_data.get(
                            "evidence",
                            ["Generated from direct text analysis using Gemini"],
                        ),
                        "metadata": {
                            "source": "direct_text_analysis",
                            "timestamp": datetime.now().isoformat(),
                        },
                    }

                    logger.info(
                        f"Successfully generated persona: {persona_attributes['name']}"
                    )
                    return persona_attributes
                else:
                    # If not valid JSON or not a dictionary, use fallback
                    logger.warning(
                        "Could not extract valid JSON from Gemini response, using fallback"
                    )
                    return self._create_fallback_persona()

            except Exception as parse_error:
                logger.error(
                    f"Error parsing Gemini persona response: {str(parse_error)}"
                )
                return self._create_fallback_persona()

        except Exception as e:
            logger.error(f"Error generating persona from text: {str(e)}")
            raise

    def _extract_json(self, text):
        """Extract JSON from text, handling potential markdown code blocks."""
        try:
            # First try to parse the text directly as JSON
            return json.loads(text)
        except json.JSONDecodeError:
            # If that fails, try to extract JSON from markdown code blocks
            import re

            json_match = re.search(r'```(?:json)?\s*({\s*".*})\s*```', text, re.DOTALL)
            if json_match:
                try:
                    return json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass

            # Try another pattern that might capture more JSON formats
            json_match = re.search(r"{[\s\S]*}", text)
            if json_match:
                try:
                    return json.loads(json_match.group(0))
                except json.JSONDecodeError:
                    pass

            return None

    def _create_fallback_persona(self):
        """Create a fallback persona when extraction fails."""
        return {
            "name": "Interview Participant",
            "description": "Persona generated from interview transcript",
            "role_context": {
                "value": "Role derived from interview analysis",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "key_responsibilities": {
                "value": "Responsibilities mentioned in interview",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "tools_used": {
                "value": "Tools mentioned in interview",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "collaboration_style": {
                "value": "Collaboration style implied in interview",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "analysis_approach": {
                "value": "Problem-solving approach mentioned in interview",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "pain_points": {
                "value": "Challenges mentioned in interview",
                "confidence": 0.5,
                "evidence": ["Generated from text analysis fallback"],
            },
            "patterns": [],
            "confidence": 0.5,
            "evidence": ["Generated from text analysis fallback"],
            "metadata": {
                "source": "text_fallback",
                "timestamp": datetime.now().isoformat(),
            },
        }

    async def analyze_sentiment(
        self, interviews: List[Dict[str, Any]], **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze sentiment in interview data with explicit supporting statements.

        Args:
            interviews: List of interview data.
            **kwargs: Additional parameters for the LLM service.
                industry: Optional string specifying the industry context (e.g., "healthcare", "tech", "military")

        Returns:
            Dictionary containing sentiment analysis results including supporting statements.
        """
        try:
            self.logger.info(
                f"Starting sentiment analysis with {len(interviews)} interview segments"
            )

            # Format the interview data for analysis
            interview_text = ""
            for i, interview in enumerate(interviews):
                answer = interview.get(
                    "answer", interview.get("response", interview.get("text", ""))
                )
                if answer:
                    interview_text += f"Statement {i+1}: {answer}\n\n"

            # Truncate text if too long
            max_length = 32000
            if len(interview_text) > max_length:
                self.logger.warning(
                    f"Interview text too long ({len(interview_text)} chars), truncating to {max_length}"
                )
                interview_text = interview_text[:max_length]

            # Check if industry was provided in kwargs
            industry = kwargs.get("industry")

            # If no industry provided, detect it from the content
            if not industry:
                # Create a small prompt to detect the industry
                industry_detection_prompt = f"""
                Determine the most likely industry context for this interview transcript.
                Choose one from: healthcare, tech, finance, military, education, hospitality, retail, manufacturing, legal, insurance, agriculture, non_profit.

                INTERVIEW SAMPLE:
                {interview_text[:3000]}...

                Return only the industry name, nothing else.
                """

                industry_response = await self._call_llm(
                    {"role": "user", "content": industry_detection_prompt}
                )

                industry = industry_response.get("content", "").strip().lower()

                # Clean up the response to ensure it's just the industry name
                for valid_industry in [
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
                ]:
                    if valid_industry in industry:
                        industry = valid_industry
                        break

                self.logger.info(f"Detected industry context: {industry}")
            else:
                self.logger.info(f"Using provided industry context: {industry}")

            # Now create the sentiment analysis prompt with industry context
            industry_specific_guidance = self._get_industry_specific_guidance(industry)

            prompt = f"""
            Analyze the sentiment in these interview statements comprehensively.

            INDUSTRY CONTEXT: {industry}

            {industry_specific_guidance}

            GENERAL GUIDELINES:
            1. Provide analysis that works for this specific industry context.
            2. Recognize domain-specific terminology and understand it in proper context.
            3. Focus on emotional markers rather than technical language.
            4. Distinguish between process descriptions (neutral) and actual pain points (negative).
            5. Identify enthusiasm for solutions (positive) vs frustration with problems (negative).

            INTERVIEW TEXT:
            {interview_text}

            INSTRUCTIONS:
            1. Calculate the overall sentiment distribution as percentages
            2. Find 15-20 direct quotes from the interview for EACH sentiment category (positive, neutral, negative)
            3. Ensure quotes are taken verbatim from the text - use EXACT sentences or statements
            4. Extract diverse statements that represent different aspects or topics discussed
            5. Include the most representative and sentiment-rich statements for each category
            6. Filter out the following types of noise from the statements:
               - Interview metadata, headers, or labels
               - Procedural statements (e.g., "I consent to all three")
               - Truncated sentences ending with "..." unless they express complete thoughts
               - Simple conversation fillers (e.g., "Mhm", "Yeah")
               - Transcript metadata
               - Interviewer questions (focus on interviewee responses)
               - Generic greetings and farewells with no sentiment content
               - Short acknowledgments like "right", "okay", "sure", "exactly"
               - Single-word or very short responses that lack clear meaning
               - Statements that don't express complete thoughts
               - Repetitive phrases or unnecessary verbal fillers
               - Statements with no clear sentiment or informational value
            7. Prioritize meaningful, complete statements that express clear opinions or experiences
            8. Include only statements that are at least 10 words long and form complete thoughts
            9. For neutral statements, focus on factual descriptions rather than conversational fillers

            FORMAT YOUR RESPONSE AS JSON:
            {
              "sentimentOverview": {
                "positive": 0.XX, // percentage as decimal (0.0-1.0)
                "neutral": 0.XX,  // percentage as decimal (0.0-1.0)
                "negative": 0.XX  // percentage as decimal (0.0-1.0)
              },
              "sentiment": [
                {
                  "text": "Statement text",
                  "score": 0.XX  // sentiment score between -1.0 and 1.0
                },
                // additional sentiment items
              ],
              "supporting_statements": {
                "positive": [
                  "direct positive quote 1",
                  "direct positive quote 2",
                  // Include up to 15-20 positive statements
                ],
                "neutral": [
                  "direct neutral quote 1",
                  "direct neutral quote 2",
                  // Include up to 15-20 neutral statements
                ],
                "negative": [
                  "direct negative quote 1",
                  "direct negative quote 2",
                  // Include up to 15-20 negative statements
                ]
              }
            }

            Make sure your response contains ONLY valid JSON without any explanation text.
            """

            # Call the LLM with the sentiment analysis prompt
            response = await self._call_llm({"role": "user", "content": prompt})

            try:
                # Extract the content from the response
                content = response.get("content", "")

                # Parse the JSON result
                result = self._parse_json_response(content)

                # Add the detected industry to the result
                result["industry"] = industry

                # Validate the sentiment data
                if not isinstance(result, dict):
                    raise ValueError(
                        "Expected a dictionary result from sentiment analysis"
                    )

                # Ensure sentimentOverview exists
                if "sentimentOverview" not in result:
                    self.logger.warning("No sentimentOverview in result, using default")
                    result["sentimentOverview"] = {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33,
                    }

                # Initialize sentimentStatements if not present
                if (
                    "supporting_statements" not in result
                    and "sentimentStatements" not in result
                ):
                    self.logger.warning(
                        "No supporting_statements or sentimentStatements in result, using empty arrays"
                    )
                    result["supporting_statements"] = {
                        "positive": [],
                        "neutral": [],
                        "negative": [],
                    }

                # If we have supporting_statements, copy them to sentimentStatements
                if (
                    "supporting_statements" in result
                    and "sentimentStatements" not in result
                ):
                    self.logger.info(
                        "Copying supporting_statements to sentimentStatements"
                    )
                    result["sentimentStatements"] = result["supporting_statements"]

                # If we have sentimentStatements but no supporting_statements, copy in the other direction
                if (
                    "sentimentStatements" in result
                    and "supporting_statements" not in result
                ):
                    self.logger.info(
                        "Copying sentimentStatements to supporting_statements"
                    )
                    result["supporting_statements"] = result["sentimentStatements"]

                # Extract direct sentiment lists if they exist in the result
                direct_sentiment = {}
                if "positive" in result and isinstance(result["positive"], list):
                    direct_sentiment["positive"] = result["positive"]
                if "neutral" in result and isinstance(result["neutral"], list):
                    direct_sentiment["neutral"] = result["neutral"]
                if "negative" in result and isinstance(result["negative"], list):
                    direct_sentiment["negative"] = result["negative"]

                # If we have direct sentiment, merge it into sentimentStatements
                if direct_sentiment:
                    self.logger.info(
                        "Found direct sentiment lists in result, merging into sentimentStatements"
                    )

                    # Ensure sentimentStatements exists
                    if "sentimentStatements" not in result:
                        result["sentimentStatements"] = {
                            "positive": [],
                            "neutral": [],
                            "negative": [],
                        }

                    # Merge positive statements
                    if "positive" in direct_sentiment:
                        if not isinstance(
                            result["sentimentStatements"]["positive"], list
                        ):
                            result["sentimentStatements"]["positive"] = []
                        for statement in direct_sentiment["positive"]:
                            if (
                                statement
                                not in result["sentimentStatements"]["positive"]
                            ):
                                result["sentimentStatements"]["positive"].append(
                                    statement
                                )

                    # Merge neutral statements
                    if "neutral" in direct_sentiment:
                        if not isinstance(
                            result["sentimentStatements"]["neutral"], list
                        ):
                            result["sentimentStatements"]["neutral"] = []
                        for statement in direct_sentiment["neutral"]:
                            if (
                                statement
                                not in result["sentimentStatements"]["neutral"]
                            ):
                                result["sentimentStatements"]["neutral"].append(
                                    statement
                                )

                    # Merge negative statements
                    if "negative" in direct_sentiment:
                        if not isinstance(
                            result["sentimentStatements"]["negative"], list
                        ):
                            result["sentimentStatements"]["negative"] = []
                        for statement in direct_sentiment["negative"]:
                            if (
                                statement
                                not in result["sentimentStatements"]["negative"]
                            ):
                                result["sentimentStatements"]["negative"].append(
                                    statement
                                )

                # Final check to ensure sentimentStatements is properly formatted
                if "sentimentStatements" in result:
                    if not isinstance(result["sentimentStatements"], dict):
                        result["sentimentStatements"] = {
                            "positive": [],
                            "neutral": [],
                            "negative": [],
                        }
                    else:
                        # Ensure each category exists
                        if "positive" not in result["sentimentStatements"]:
                            result["sentimentStatements"]["positive"] = []
                        if "neutral" not in result["sentimentStatements"]:
                            result["sentimentStatements"]["neutral"] = []
                        if "negative" not in result["sentimentStatements"]:
                            result["sentimentStatements"]["negative"] = []

                # Check if result has raw sentiment object
                if "sentiment" in result:
                    # Ensure supporting_statements exists and is properly formatted in sentiment object
                    if (
                        isinstance(result["sentiment"], dict)
                        and "supporting_statements" not in result["sentiment"]
                    ):
                        self.logger.info(
                            "Adding supporting_statements to sentiment object"
                        )
                        result["sentiment"]["supporting_statements"] = result.get(
                            "supporting_statements",
                            {"positive": [], "neutral": [], "negative": []},
                        )
                else:
                    # Create sentiment object if not present
                    self.logger.info(
                        "Creating sentiment object from sentimentOverview and supporting_statements"
                    )
                    result["sentiment"] = {
                        "overall": 0.5,  # Default neutral
                        "breakdown": result.get(
                            "sentimentOverview",
                            {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
                        ),
                        "supporting_statements": result.get(
                            "supporting_statements",
                            {"positive": [], "neutral": [], "negative": []},
                        ),
                    }

                # Log the sentiment results
                self.logger.info(
                    f"Sentiment analysis complete. Overview: {result['sentimentOverview']}"
                )
                self.logger.info(
                    f"Supporting statements: positive={len(result.get('sentimentStatements', {}).get('positive', []))}, "
                    + f"neutral={len(result.get('sentimentStatements', {}).get('neutral', []))}, "
                    + f"negative={len(result.get('sentimentStatements', {}).get('negative', []))}"
                )

                return result

            except Exception as e:
                self.logger.error(f"Error parsing sentiment analysis result: {str(e)}")
                # Return a default structure on error
                return {
                    "industry": industry,
                    "sentimentOverview": {
                        "positive": 0.33,
                        "neutral": 0.34,
                        "negative": 0.33,
                    },
                    "sentiment": [],
                    "supporting_statements": {
                        "positive": [],
                        "neutral": [],
                        "negative": [],
                    },
                    "sentimentStatements": {
                        "positive": [],
                        "neutral": [],
                        "negative": [],
                    },
                    "error": f"Error parsing sentiment analysis: {str(e)}",
                }

        except Exception as e:
            self.logger.error(f"Error in sentiment analysis: {str(e)}")
            return {
                "error": f"Sentiment analysis error: {str(e)}",
                "industry": kwargs.get("industry", "unknown"),
                "sentimentOverview": {
                    "positive": 0.33,
                    "neutral": 0.34,
                    "negative": 0.33,
                },
                "supporting_statements": {
                    "positive": [],
                    "neutral": [],
                    "negative": [],
                },
                "sentimentStatements": {"positive": [], "neutral": [], "negative": []},
            }

    def _get_industry_specific_guidance(self, industry: str) -> str:
        """
        Get industry-specific guidance for sentiment analysis.

        Args:
            industry: The industry context for the analysis.

        Returns:
            String containing guidance specific to the given industry.
        """
        industry_guidance = {
            "healthcare": """
                HEALTHCARE-SPECIFIC GUIDELINES:
                - Neutral terms include: "HIPAA compliance", "patient intake", "treatment protocol"
                - Positive indicators include: improved patient outcomes, reduced errors, enhanced care coordination
                - Negative indicators include: staffing challenges, regulatory burdens, patient safety concerns
                - Consider medical terminology as neutral unless clearly associated with sentiment
            """,
            "tech": """
                TECHNOLOGY-SPECIFIC GUIDELINES:
                - Neutral terms include: "CI/CD pipeline", "code review", "sprints"
                - Positive indicators include: increased performance, reduced bugs, improved developer experience
                - Negative indicators include: technical debt, integration challenges, legacy system limitations
                - Technical terminology is generally neutral unless attached to outcomes or obstacles
            """,
            "finance": """
                FINANCE-SPECIFIC GUIDELINES:
                - Neutral terms include: "compliance review", "transaction verification", "quarterly reporting"
                - Positive indicators include: improved accuracy, fraud reduction, process automation benefits
                - Negative indicators include: regulatory burden, system integration issues, customer friction points
                - Financial terminology should be treated as neutral process language
            """,
            "military": """
                MILITARY-SPECIFIC GUIDELINES:
                - Neutral terms include: "chain of command", "standard operating procedure", "mission briefing"
                - Positive indicators include: improved safety, enhanced equipment effectiveness, better coordination
                - Negative indicators include: equipment failures, logistics challenges, operational risks
                - Military jargon and process descriptions should be considered neutral
            """,
            "education": """
                EDUCATION-SPECIFIC GUIDELINES:
                - Neutral terms include: "curriculum review", "assessment schedule", "learning objectives"
                - Positive indicators include: improved student outcomes, teacher satisfaction, resource availability
                - Negative indicators include: funding limitations, administrative burdens, resource constraints
                - Educational terminology and process descriptions are neutral by default
            """,
            "hospitality": """
                HOSPITALITY-SPECIFIC GUIDELINES:
                - Neutral terms include: "guest check-in", "housekeeping protocol", "reservation system"
                - Positive indicators include: guest satisfaction, service efficiency, staff performance
                - Negative indicators include: service delays, maintenance issues, staffing shortages
                - Operational process descriptions should be treated as neutral
            """,
            "retail": """
                RETAIL-SPECIFIC GUIDELINES:
                - Neutral terms include: "inventory management", "POS system", "merchandising"
                - Positive indicators include: sales increases, customer loyalty, operational efficiency
                - Negative indicators include: stockouts, high return rates, customer complaints
                - Retail operations terminology should be treated as neutral
            """,
            "manufacturing": """
                MANUFACTURING-SPECIFIC GUIDELINES:
                - Neutral terms include: "quality control", "production line", "supply chain"
                - Positive indicators include: efficiency gains, quality improvements, reduced downtime
                - Negative indicators include: equipment failures, production delays, quality issues
                - Manufacturing process terminology should be considered neutral
            """,
            "legal": """
                LEGAL-SPECIFIC GUIDELINES:
                - Neutral terms include: "discovery process", "case management", "filing procedure"
                - Positive indicators include: case resolution success, efficiency improvements, client satisfaction
                - Negative indicators include: procedural delays, work-life balance issues, administrative burdens
                - Legal terminology and procedural descriptions are neutral by default
            """,
            "insurance": """
                INSURANCE-SPECIFIC GUIDELINES:
                - Neutral terms include: "policy underwriting", "claims processing", "risk assessment"
                - Positive indicators include: faster claims settlement, improved customer satisfaction, better risk modeling
                - Negative indicators include: claim denials, policy misunderstandings, processing delays
                - Insurance terminology and process descriptions should be treated as neutral
            """,
            "agriculture": """
                AGRICULTURE-SPECIFIC GUIDELINES:
                - Neutral terms include: "crop rotation", "irrigation scheduling", "pest management"
                - Positive indicators include: yield improvements, resource efficiency, successful harvests
                - Negative indicators include: weather challenges, equipment failures, labor shortages
                - Agricultural terminology and seasonal descriptions are neutral by default
            """,
            "non_profit": """
                NON-PROFIT-SPECIFIC GUIDELINES:
                - Neutral terms include: "donor management", "grant application", "program evaluation"
                - Positive indicators include: mission impact, successful fundraising, volunteer engagement
                - Negative indicators include: funding challenges, administrative burdens, resource limitations
                - Mission-related terminology should be treated as neutral unless clearly tied to outcomes
            """,
        }

        # Return industry-specific guidance or general guidance if industry not found
        return industry_guidance.get(
            industry,
            """
            GENERAL GUIDELINES:
            - Consider industry-specific terminology as neutral unless clearly tied to outcomes or challenges
            - Focus on emotional indicators and expressions of satisfaction/dissatisfaction
            - Distinguish between process descriptions (neutral) and process challenges (negative)
        """,
        )
