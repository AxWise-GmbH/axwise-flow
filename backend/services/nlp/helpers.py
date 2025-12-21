"""
Helper functions for NLP processing.

Provides validation and pattern utility functions.
"""

import json
import logging
from typing import Any, Dict, List, Tuple

logger = logging.getLogger(__name__)


def determine_pattern_category(
    name: str, description: str, statements: List[str]
) -> str:
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
        "Workflow": [
            "workflow", "process", "step", "sequence", "procedure", "routine", "method",
        ],
        "Coping Strategy": [
            "cope", "strategy", "deal with", "manage", "handle", "overcome", "mitigate",
        ],
        "Decision Process": [
            "decision", "choose", "select", "evaluate", "assess", "judge", "determine",
        ],
        "Workaround": [
            "workaround", "alternative", "bypass", "circumvent", "hack", "shortcut",
        ],
        "Habit": [
            "habit", "regular", "consistently", "always", "frequently", "tend to", "typically",
        ],
        "Collaboration": [
            "collaborate", "team", "share", "together", "group", "collective", "joint",
        ],
        "Communication": [
            "communicate", "discuss", "talk", "message", "inform", "express", "convey",
        ],
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


def generate_detailed_description(
    name: str, description: str, statements: List[str]
) -> str:
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
    if (
        description
        and description != "No description available."
        and len(description) > 50
    ):
        return description

    # Use a generic but specific description based on the pattern name
    return (
        f"Users demonstrate specific behaviors related to {name.lower()}, "
        f"showing consistent patterns in how they interact with the system. "
        f"These behaviors reflect how users approach and engage with this aspect "
        f"of the experience."
    )


def generate_specific_impact(
    name: str, description: str, sentiment: float, statements: List[str]
) -> str:
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
            "facilitates more effective task completion",
        ]
    elif sentiment < -0.3:
        impact_type = "negative"
        consequences = [
            "creates friction and frustration for users",
            "slows down task completion and reduces efficiency",
            "diminishes user confidence in the system",
            "leads to workarounds that may introduce errors",
            "increases cognitive load and user effort",
        ]
    else:
        impact_type = "mixed"
        consequences = [
            "has both positive and negative effects on user experience",
            "creates trade-offs between efficiency and thoroughness",
            "varies in impact depending on user expertise and context",
            "affects different user groups in different ways",
            "presents both opportunities and challenges for design",
        ]

    # Select consequences based on pattern name
    name_words = set(name.lower().split())
    selected_consequences = []

    for consequence in consequences:
        for word in name_words:
            if len(word) > 4 and word in consequence:
                selected_consequences.append(consequence)
                break

    # If no specific matches, take the first two general consequences
    if not selected_consequences:
        selected_consequences = consequences[:2]
    else:
        selected_consequences = selected_consequences[:2]

    # Construct impact statement
    impact_statement = f"This pattern {selected_consequences[0]}"
    if len(selected_consequences) > 1:
        impact_statement += f" and {selected_consequences[1]}"
    impact_statement += (
        f", resulting in a {impact_type} effect on overall system usability "
        f"and user satisfaction."
    )

    return impact_statement


def generate_actionable_recommendations(
    name: str, description: str, sentiment: float
) -> List[str]:
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
            f"Develop clear documentation and tooltips to help users navigate the {name.lower()} process more effectively",
        ]
    elif sentiment > 0.3:
        # Positive patterns should be enhanced
        recommendations = [
            f"Expand the {name.lower()} functionality to cover more use cases and scenarios",
            f"Highlight the {name.lower()} feature in onboarding materials to increase awareness",
            f"Gather additional user feedback on {name.lower()} to identify further enhancement opportunities",
        ]
    else:
        # Neutral patterns need investigation
        recommendations = [
            f"Conduct further research to better understand user needs related to {name.lower()}",
            f"Prototype alternative approaches to {name.lower()} and test with users",
            f"Analyze usage data to identify patterns and opportunities for improving {name.lower()}",
        ]

    return recommendations


def process_sentiment_results(sentiment_result: Dict[str, Any]) -> Dict[str, List[str]]:
    """
    Process sentiment results to extract supporting statements.

    Args:
        sentiment_result: Raw sentiment result from LLM

    Returns:
        Dict with positive, neutral, negative lists
    """
    try:
        # Check if the response is a string wrapped in markdown code blocks
        if isinstance(sentiment_result, str):
            logger.warning(
                "Sentiment result is a string, attempting to parse as JSON"
            )

            # Check for markdown code blocks
            if sentiment_result.startswith("```json") and sentiment_result.endswith("```"):
                logger.info(
                    "Detected markdown code blocks in sentiment result, extracting JSON content"
                )
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

                # Check if scores are suspiciously close to 0.33 each
                if (
                    abs(positive_score - 0.33) < 0.01
                    and abs(neutral_score - 0.34) < 0.01
                    and abs(negative_score - 0.33) < 0.01
                ):
                    logger.warning(
                        "Detected hardcoded sentiment scores (0.33, 0.34, 0.33). "
                        "This may indicate a parsing issue."
                    )

            return {"positive": [], "neutral": [], "negative": []}
    except Exception as e:
        logger.error(f"Error processing sentiment results: {str(e)}")
        return {"positive": [], "neutral": [], "negative": []}


async def validate_results(results: Dict[str, Any]) -> Tuple[bool, List[str]]:
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
            "personas",
        ]

        # Check for missing required fields (none in this case)
        missing_fields = [
            field for field in required_fields if field not in results
        ]

        # Log missing optional fields but don't fail validation
        missing_optional = [
            field for field in optional_fields if field not in results
        ]
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

        # SCHEMA FIX: Ensure sentiment field matches schema (List[Dict[str, Any]])
        if "sentiment" in results:
            if isinstance(results["sentiment"], dict):
                logger.info("Converting sentiment dictionary to list format for schema")
                results["sentiment"] = [results["sentiment"]]
            elif not isinstance(results["sentiment"], list):
                logger.warning("Sentiment field is not a list, initializing empty list")
                results["sentiment"] = []
        else:
            results["sentiment"] = []

        if "personas" in results and not isinstance(results["personas"], list):
            logger.warning("Personas field is not a list, converting to empty list")
            results["personas"] = []

        # Ensure we have at least some useful data
        has_some_data = (
            ("patterns" in results and len(results["patterns"]) > 0)
            or ("themes" in results and len(results["themes"]) > 0)
            or ("enhanced_themes" in results and len(results["enhanced_themes"]) > 0)
            or ("insights" in results and len(results["insights"]) > 0)
            or ("personas" in results and len(results["personas"]) > 0)
        )

        if not has_some_data:
            logger.warning("No useful data found in results")
            return False, ["No useful data found"]

        logger.info("Validation passed with available data")
        return True, []

    except Exception as e:
        logger.error(f"Error validating results: {str(e)}")
        return False, [str(e)]


async def create_minimal_sentiment_result() -> Dict[str, Any]:
    """
    Create a minimal sentiment result for schema compatibility when sentiment
    analysis is disabled.

    Returns:
        Dictionary containing minimal sentiment analysis results for schema compliance
    """
    logger.info("Creating minimal sentiment result (sentiment analysis disabled)")

    return {
        "sentiment_overview": {"positive": 0.33, "neutral": 0.34, "negative": 0.33},
        "sentiment_details": [],
        "sentiment_statements": {"positive": [], "neutral": [], "negative": []},
        "disabled": True,
        "analysis_method": "disabled_for_performance",
    }

