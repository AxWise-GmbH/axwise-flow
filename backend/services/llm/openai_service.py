"""
OpenAI LLM service implementation.
"""

import logging
import json
import asyncio
import os
from typing import Dict, Any, List, Optional, Union
import openai
from openai import AsyncOpenAI
import re
import time
from pydantic import ValidationError

from backend.schemas import Theme, Pattern, Insight
from backend.utils.json_parser import (
    parse_llm_json_response,
    normalize_persona_response,
)

# Configure logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to DEBUG for more detailed logging


class OpenAIService:
    """Service for interacting with OpenAI's API."""

    def __init__(self, config: Dict[str, Any]):
        """Initialize the OpenAI service with configuration."""
        self.REDACTED_API_KEY = config.get("REDACTED_API_KEY")
        self.model = config.get("model", "gpt-4o-2024-08-06")
        self.temperature = config.get("temperature", 0.0)
        self.max_tokens = config.get("max_tokens", 16384)

        # Initialize OpenAI client
        self.client = AsyncOpenAI(REDACTED_API_KEY=self.REDACTED_API_KEY)

        logger.info(f"Initialized OpenAI service with model: {self.model}")

    async def analyze(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze data using OpenAI."""
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

            # Log the prompt for debugging
            logger.debug(f"System message for task {task}:\n{system_message}")

            # Call OpenAI API
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_message},
                    {"role": "user", "content": text},
                ],
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                response_format={"type": "json_object"},
            )

            # Extract and parse response
            result_text = response.choices[0].message.content
            logger.debug(f"Raw response for task {task}:\n{result_text}")

            result = json.loads(result_text)

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

                    # Ensure definition exists
                    if "definition" not in theme:
                        theme["definition"] = f"Theme related to {theme['name']}"

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

                    # Add process field if not present
                    if "process" not in theme:
                        theme["process"] = "basic"

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

                    # Convert sentiment from 0-1 to -1 to 1 scale if needed
                    if (
                        "sentiment" in pattern
                        and pattern["sentiment"] is not None
                        and 0 <= pattern["sentiment"] <= 1
                    ):
                        pattern["sentiment"] = (pattern["sentiment"] - 0.5) * 2
                    elif "sentiment" not in pattern:
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
                # Ensure sentiment has proper structure with supporting statements
                if "sentiment" in result:
                    sentiment = result["sentiment"]
                    # Convert overall sentiment from 0-1 to -1 to 1 scale
                    if "overall" in sentiment:
                        sentiment["overall"] = (sentiment["overall"] - 0.5) * 2

                    # Ensure breakdown sums to 1.0
                    if "breakdown" in sentiment:
                        total = sum(sentiment["breakdown"].values())
                        if total > 0:
                            for key in sentiment["breakdown"]:
                                sentiment["breakdown"][key] = round(
                                    sentiment["breakdown"][key] / total, 3
                                )
                    else:
                        sentiment["breakdown"] = {
                            "positive": 0.33,
                            "neutral": 0.34,
                            "negative": 0.33,
                        }

                    # Ensure supporting statements exist
                    if "supporting_statements" not in sentiment:
                        logger.warning(
                            "No supporting_statements found in sentiment data, checking alternative fields"
                        )

                        # Check for alternative fields that might contain statements
                        if "positive" in sentiment and isinstance(
                            sentiment["positive"], list
                        ):
                            logger.info(
                                f"Found {len(sentiment['positive'])} statements in 'positive' field"
                            )
                            positive_statements = sentiment["positive"]
                        else:
                            positive_statements = []

                        if "negative" in sentiment and isinstance(
                            sentiment["negative"], list
                        ):
                            logger.info(
                                f"Found {len(sentiment['negative'])} statements in 'negative' field"
                            )
                            negative_statements = sentiment["negative"]
                        else:
                            negative_statements = []

                        # Create neutral statements (can be empty)
                        neutral_statements = []

                        # Extract from details if available and other fields were empty
                        if (
                            not positive_statements
                            and not negative_statements
                            and "details" in sentiment
                        ):
                            logger.info(
                                f"Attempting to extract statements from {len(sentiment['details'])} details"
                            )
                            for detail in sentiment["details"]:
                                if (
                                    isinstance(detail, dict)
                                    and "evidence" in detail
                                    and "score" in detail
                                ):
                                    evidence = detail["evidence"]
                                    score = detail["score"]

                                    if isinstance(evidence, str) and evidence.strip():
                                        if score >= 0.6:
                                            positive_statements.append(evidence)
                                        elif score <= 0.4:
                                            negative_statements.append(evidence)
                                        else:
                                            neutral_statements.append(evidence)

                        sentiment["supporting_statements"] = {
                            "positive": positive_statements,
                            "neutral": neutral_statements,
                            "negative": negative_statements,
                        }

                        logger.info(
                            f"Created supporting_statements with {len(positive_statements)} positive, {len(neutral_statements)} neutral, and {len(negative_statements)} negative statements"
                        )
                    else:
                        logger.info(
                            f"Found existing supporting_statements in sentiment data"
                        )
                        # Log samples of the first statement in each category if available
                        if sentiment["supporting_statements"].get("positive", []):
                            logger.info(
                                f"Sample positive statement: {sentiment['supporting_statements']['positive'][0]}"
                            )
                        if sentiment["supporting_statements"].get("neutral", []):
                            logger.info(
                                f"Sample neutral statement: {sentiment['supporting_statements']['neutral'][0]}"
                            )
                        if sentiment["supporting_statements"].get("negative", []):
                            logger.info(
                                f"Sample negative statement: {sentiment['supporting_statements']['negative'][0]}"
                            )

                    # Ensure details have proper sentiment scores
                    if "details" in sentiment:
                        for detail in sentiment["details"]:
                            if "score" in detail:
                                detail["score"] = (detail["score"] - 0.5) * 2

                    # Create sentimentStatements field for frontend compatibility
                    result["sentimentStatements"] = {
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
                    logger.info(
                        f"Added sentimentStatements field with {len(result['sentimentStatements']['positive'])} positive, {len(result['sentimentStatements']['neutral'])} neutral, and {len(result['sentimentStatements']['negative'])} negative statements"
                    )

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

            # Add persona validation for persona_formation task
            elif task == "persona_formation":
                # Normalize the response format first
                result = normalize_persona_response(result)

                # Import Persona schema for validation
                from backend.schemas import Persona as PersonaSchema
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

            logger.info(f"Successfully analyzed data with OpenAI for task: {task}")
            logger.debug(
                f"Processed result for task {task}:\n{json.dumps(result, indent=2)}"
            )
            return result

        except Exception as e:
            logger.error(f"Error calling OpenAI API: {str(e)}")
            return {"error": f"OpenAI API error: {str(e)}"}

    def _get_system_message(self, task: str, data: Dict[str, Any]) -> str:
        """Get system message for OpenAI based on task"""
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
                5. A concise definition of the theme (one sentence)
                6. Related keywords or terms associated with the theme
                7. Associated codes from the coding process (e.g., PAIN_POINT, USER_NEED)
                8. Reliability score (0-1) indicating confidence in the theme identification

                Format your response as a JSON object with this structure:
                {
                  "themes": [
                    {
                      "name": "Theme name - be specific and concrete",
                      "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                      "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                      "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"],
                      "definition": "One-sentence description of the theme",
                      "keywords": ["keyword1", "keyword2", "keyword3"],
                      "codes": ["CODE_1", "CODE_2"],
                      "reliability": 0.XX (decimal between 0-1 indicating confidence)
                    },
                    ...
                  ]
                }

                IMPORTANT:
                - Use EXACT sentences from the ORIGINAL ANSWERS for the statements. Do not summarize or paraphrase.
                - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
                - Ensure 100% of your response is in valid JSON format.
                - For codes, use uppercase with underscores (e.g., USER_NEED, PAIN_POINT, FEATURE_REQUEST).
                - For reliability, consider factors like consistency across responses, clarity of evidence, and number of supporting statements.
                """
            else:
                return """
                Analyze the interview transcripts to identify key themes. Your analysis should be comprehensive and based on actual content from the transcripts.

                Focus on extracting:
                1. Clear, specific themes (not vague categories)
                2. Quantify frequency as a decimal between 0.0-1.0
                3. Sentiment association with each theme (as a decimal between -1.0 and 1.0, where -1.0 is negative, 0.0 is neutral, and 1.0 is positive)
                4. Supporting statements as DIRECT QUOTES from the text - use exact sentences, not summarized or paraphrased versions
                5. A concise definition of the theme (one sentence)
                6. Related keywords or terms associated with the theme
                7. Associated codes from the coding process (e.g., PAIN_POINT, USER_NEED)
                8. Reliability score (0-1) indicating confidence in the theme identification

                Format your response as a JSON object with this structure:
                {
                  "themes": [
                    {
                      "name": "Theme name - be specific and concrete",
                      "frequency": 0.XX, (decimal between 0-1 representing prevalence)
                      "sentiment": X.XX, (decimal between -1 and 1, where -1 is negative, 0 is neutral, 1 is positive)
                      "statements": ["EXACT QUOTE FROM TEXT", "ANOTHER EXACT QUOTE"],
                      "definition": "One-sentence description of the theme",
                      "keywords": ["keyword1", "keyword2", "keyword3"],
                      "codes": ["CODE_1", "CODE_2"],
                      "reliability": 0.XX (decimal between 0-1 indicating confidence)
                    },
                    ...
                  ]
                }

                IMPORTANT:
                - Use EXACT sentences from the text for the statements. Do not summarize or paraphrase.
                - Do not make up information. If there are fewer than 5 clear themes, that's fine - focus on quality.
                - Ensure 100% of your response is in valid JSON format.
                - For codes, use uppercase with underscores (e.g., USER_NEED, PAIN_POINT, FEATURE_REQUEST).
                - For reliability, consider factors like consistency across responses, clarity of evidence, and number of supporting statements.
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

            Return your analysis in the following JSON format:
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
                    }
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
            You are an expert sentiment analyst. Analyze the provided text and provide a detailed sentiment analysis.
            Include:
            1. An overall sentiment score between 0 and 1 (0 being very negative, 0.5 being neutral, 1 being very positive)
            2. A breakdown of positive, neutral, and negative sentiment proportions (must sum to 1.0)
            3. At least 3 supporting statements for each sentiment category
            4. Detailed sentiment analysis for specific topics mentioned

            Return your analysis in the following JSON format:
            {
                "sentiment": {
                    "overall": 0.7,
                    "breakdown": {
                        "positive": 0.6,
                        "neutral": 0.3,
                        "negative": 0.1
                    },
                    "supporting_statements": {
                        "positive": [
                            "Direct positive quote/paraphrase 1",
                            "Direct positive quote/paraphrase 2",
                            "Direct positive quote/paraphrase 3"
                        ],
                        "neutral": [
                            "Direct neutral quote/paraphrase 1",
                            "Direct neutral quote/paraphrase 2",
                            "Direct neutral quote/paraphrase 3"
                        ],
                        "negative": [
                            "Direct negative quote/paraphrase 1",
                            "Direct negative quote/paraphrase 2",
                            "Direct negative quote/paraphrase 3"
                        ]
                    },
                    "details": [
                        {
                            "topic": "Topic Name",
                            "score": 0.8,
                            "evidence": "Supporting quote from text"
                        }
                    ]
                }
            }

            Ensure that:
            - The overall sentiment score reflects the true emotional tone
            - The breakdown percentages sum exactly to 1.0
            - Each sentiment category has at least 3 supporting statements
            - Supporting statements are actual quotes or close paraphrases
            - Topic scores align with the provided evidence
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

            LEGACY ATTRIBUTES (for backward compatibility, each with value, confidence score 0.0-1.0, and supporting evidence):
            14. role_context: Primary job function and work environment
            15. key_responsibilities: Main tasks mentioned
            16. tools_used: Specific tools or methods named
            17. collaboration_style: How they work with others
            18. analysis_approach: How they approach problems/analysis
            19. pain_points: Specific challenges mentioned

            OVERALL PERSONA INFORMATION:
            20. patterns: List of behavioral patterns associated with this persona
            21. overall_confidence: Overall confidence score for the entire persona (0.0-1.0)
            22. supporting_evidence_summary: Key evidence supporting the overall persona characterization

            FORMAT YOUR RESPONSE AS JSON with the following structure:
            {{
              "name": "Role-Based Name",
              "archetype": "Persona Category",
              "description": "Brief overview of the persona",
              "demographics": {{
                "value": "Age, experience, etc.",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2"]
              }},
              "goals_and_motivations": {{
                "value": "Primary objectives and aspirations",
                "confidence": 0.7,
                "evidence": ["Quote 1", "Quote 2"]
              }},
              ... (other attributes with same structure) ...
              "role_context": {{
                "value": "Description of role context",
                "confidence": 0.8,
                "evidence": ["Quote 1", "Quote 2"]
              }},
              ... (other legacy attributes with same structure) ...
              "patterns": ["Pattern 1", "Pattern 2"],
              "overall_confidence": 0.75,
              "supporting_evidence_summary": ["Key evidence 1", "Key evidence 2"]
            }}

            IMPORTANT: Ensure all attributes are included with proper structure, even if confidence is low or evidence is limited.
            """

        elif task == "insight_generation":
            # Extract additional context from data
            themes = data.get("themes", [])
            patterns = data.get("patterns", [])
            sentiment = data.get("sentiment", {})

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
                    context += f"- {pattern.get('category', 'Unknown')}: {pattern.get('description', 'No description')}\n"
                    if "evidence" in pattern:
                        for evidence in pattern.get("evidence", []):
                            context += f"  * {evidence}\n"

            if sentiment:
                context += "\nSentiment:\n"
                if "supporting_statements" in sentiment:
                    for category, statements in sentiment[
                        "supporting_statements"
                    ].items():
                        context += f"\n{category.capitalize()} sentiment examples:\n"
                        for stmt in statements:
                            context += f"  * {stmt}\n"

            return f"""
            You are an expert insight generator. {context}

            Based on the analysis above and the provided text, generate insights that go beyond the surface level.
            For each insight, provide:
            1. A topic that captures the key area of insight
            2. A detailed observation that provides actionable information
            3. At least 2 supporting pieces of evidence from the text (direct quotes or paraphrases)
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

                final_themes.append(
                    {
                        "id": theme_id,
                        "name": theme.get("name", f"Theme {theme_id}"),
                        "definition": theme.get("definition", ""),
                        "frequency": theme.get("frequency", 0.0),
                        "statements": theme.get("example_quotes", []),
                        "sentiment": theme.get("sentiment_estimate", 0.0),
                        "codes": matching_refined_theme.get("codes", []),
                        "keywords": self._extract_keywords_from_codes(
                            matching_refined_theme.get("codes", [])
                        ),
                        "reliability": (
                            reliability_data.get("agreement_statistics", {}).get(
                                "cohen_kappa", 0.0
                            )
                            if reliability_data
                            else None
                        ),
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

    def _parse_json_response(self, response_text):
        """Parse JSON from the response text, handling various formats"""
        try:
            # Try to find JSON within the text (in case there's markdown or other text)
            json_match = re.search(r"```json\s*([\s\S]*?)\s*```", response_text)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON without the markdown markers
                json_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", response_text)
                if json_match:
                    json_str = json_match.group(1)
                else:
                    json_str = response_text

            return json.loads(json_str)
        except Exception as e:
            self.logger.error(f"Failed to parse JSON: {str(e)}")
            self.logger.debug(f"Response text: {response_text}")
            raise Exception(f"Failed to parse response as JSON: {str(e)}")

    async def analyze_interviews(self, data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze interview data using OpenAI.
        """
        # Implementation logic for interview analysis
        pass

    async def analyze_sentiment(
        self, interviews: List[Dict[str, Any]], **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze sentiment in interview data with explicit supporting statements.

        Args:
            interviews: List of interview data.
            **kwargs: Additional parameters for the LLM service.

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
            max_length = 16000  # OpenAI context window is typically smaller than Gemini
            if len(interview_text) > max_length:
                self.logger.warning(
                    f"Interview text too long ({len(interview_text)} chars), truncating to {max_length}"
                )
                interview_text = interview_text[:max_length]

            # OpenAI-specific prompt
            system_prompt = """
            You are an expert sentiment analyst specializing in user interview analysis.
            Extract sentiment from interview statements with high accuracy and identify specific statements
            that represent positive, neutral, and negative sentiments.
            """

            user_prompt = f"""
            Analyze the sentiment in these interview statements. For each sentiment category (positive, neutral, negative),
            identify representative statements from the interview that reflect that sentiment.

            INTERVIEW TEXT:
            {interview_text}

            INSTRUCTIONS:
            1. Calculate the overall sentiment distribution as percentages
            2. Find 3-5 direct quotes from the interview for each sentiment category
            3. Ensure quotes are taken verbatim from the text

            FORMAT YOUR RESPONSE AS JSON:
            {{
              "sentimentOverview": {{
                "positive": 0.XX, // percentage as decimal (0.0-1.0)
                "neutral": 0.XX,  // percentage as decimal (0.0-1.0)
                "negative": 0.XX  // percentage as decimal (0.0-1.0)
              }},
              "sentiment": [
                {{
                  "text": "Statement text",
                  "score": 0.XX  // sentiment score between -1.0 and 1.0
                }},
                // additional sentiment items
              ],
              "supporting_statements": {{
                "positive": ["direct quote 1", "direct quote 2", ...],
                "neutral": ["direct quote 1", "direct quote 2", ...],
                "negative": ["direct quote 1", "direct quote 2", ...]
              }}
            }}

            Make sure your response contains ONLY valid JSON without any explanation text.
            """

            # Call the OpenAI API with the sentiment analysis prompt
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]

            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},  # Ensure JSON response
            )

            try:
                # Extract the content from the response
                content = response.choices[0].message.content

                # Parse the JSON result
                result = json.loads(content)

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

                # Ensure supporting_statements exists and is properly formatted
                if "supporting_statements" not in result:
                    self.logger.warning(
                        "No supporting_statements in result, using empty arrays"
                    )
                    result["supporting_statements"] = {
                        "positive": [],
                        "neutral": [],
                        "negative": [],
                    }

                # Also set sentimentStatements for direct access
                result["sentimentStatements"] = result["supporting_statements"]

                # Log the sentiment results
                self.logger.info(
                    f"Sentiment analysis complete. Overview: {result['sentimentOverview']}"
                )
                self.logger.info(
                    f"Supporting statements: positive={len(result['supporting_statements']['positive'])}, "
                    + f"neutral={len(result['supporting_statements']['neutral'])}, "
                    + f"negative={len(result['supporting_statements']['negative'])}"
                )

                return result

            except Exception as e:
                self.logger.error(f"Error parsing sentiment analysis result: {str(e)}")
                # Return a default structure on error
                return {
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
