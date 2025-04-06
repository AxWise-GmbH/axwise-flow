from fastapi import HTTPException
from sqlalchemy.orm import Session
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Literal
from sqlalchemy import desc, asc

from backend.models import User, InterviewData, AnalysisResult, Persona

# Configure logging
logger = logging.getLogger(__name__)

# Default sentiment values when none are available
DEFAULT_SENTIMENT_OVERVIEW = {"positive": 0.33, "neutral": 0.34, "negative": 0.33}


class ResultsService:
    """
    Service class for handling retrieval and formatting of analysis results.
    """

    def __init__(self, db: Session, user: User):
        """
        Initialize the ResultsService with database session and user.

        Args:
            db (Session): SQLAlchemy database session
            user (User): Current authenticated user
        """
        self.db = db
        self.user = user

    def get_analysis_result(self, result_id: int) -> Dict[str, Any]:
        """
        Retrieve a specific analysis result.

        Args:
            result_id: ID of the analysis result to retrieve

        Returns:
            Analysis result data formatted for API response

        Raises:
            HTTPException: If result not found or not accessible by user
        """
        try:
            logger.info(
                f"Retrieving results for result_id: {result_id}, user: {self.user.user_id}"
            )

            # Query for results with user authorization check
            analysis_result = (
                self.db.query(AnalysisResult)
                .join(InterviewData)
                .filter(
                    AnalysisResult.result_id == result_id,
                    InterviewData.user_id == self.user.user_id,
                )
                .first()
            )

            if not analysis_result:
                logger.error(
                    f"Results not found - result_id: {result_id}, user_id: {self.user.user_id}"
                )
                raise HTTPException(
                    status_code=404,
                    detail=f"Results not found for result_id: {result_id}",
                )

            # Check if results are available
            if not analysis_result.results:
                return {
                    "status": "processing",
                    "message": "Analysis is still in progress.",
                }

            # Check for error in results
            if (
                isinstance(analysis_result.results, dict)
                and "error" in analysis_result.results
            ):
                return {
                    "status": "error",
                    "result_id": analysis_result.result_id,
                    "error": analysis_result.results["error"],
                }

            # Parse stored results and format them
            try:
                # Parse stored results to Python dict
                results_dict = (
                    json.loads(analysis_result.results)
                    if isinstance(analysis_result.results, str)
                    else analysis_result.results
                )

                # Enhanced logging for personas debug
                logger.info(f"Results keys available: {list(results_dict.keys())}")

                # Ensure personas are present in the results dictionary
                # Using direct personas from results JSON instead of database
                self._ensure_personas_present(results_dict, result_id)

                # Get personas from the results JSON (current approach)
                persona_list = []
                if "personas" in results_dict and isinstance(
                    results_dict["personas"], list
                ):
                    from backend.schemas import PersonaTrait, Persona as PersonaSchema

                    # Log persona count for debugging
                    logger.info(
                        f"Found {len(results_dict['personas'])} personas in results JSON"
                    )

                    # Process each persona from JSON
                    for p_data in results_dict["personas"]:
                        try:
                            if not isinstance(p_data, dict):
                                logger.warning(
                                    f"Skipping non-dict persona data: {type(p_data)}"
                                )
                                continue

                            # Create proper persona schema object
                            persona = self._map_json_to_persona_schema(p_data)
                            persona_list.append(persona)

                            # Store this persona in the database for future use
                            # This won't affect current request but prepares for future schema changes
                            # Not blocking the request if this fails, just logging errors
                            try:
                                self._store_persona_in_db(p_data, result_id)
                            except Exception as store_err:
                                logger.error(
                                    f"Error storing persona in DB: {str(store_err)}"
                                )

                        except Exception as e:
                            logger.error(f"Error mapping persona from JSON: {str(e)}")

                # Create formatted response
                formatted_results = {
                    "status": "completed",
                    "result_id": analysis_result.result_id,
                    "analysis_date": analysis_result.analysis_date,
                    "results": {
                        "themes": results_dict.get("themes", []),
                        "enhanced_themes": results_dict.get(
                            "enhanced_themes", []
                        ),  # Include enhanced themes
                        "patterns": results_dict.get("patterns", []),
                        "sentiment": results_dict.get("sentiment", []),
                        "sentimentOverview": results_dict.get(
                            "sentimentOverview", DEFAULT_SENTIMENT_OVERVIEW
                        ),
                        "sentimentStatements": results_dict.get(
                            "sentimentStatements",
                            {"positive": [], "neutral": [], "negative": []},
                        ),
                        "insights": results_dict.get("insights", []),
                        "personas": persona_list,  # Use personas from the results JSON
                    },
                    "llm_provider": analysis_result.llm_provider,
                    "llm_model": analysis_result.llm_model,
                }

                # Log whether sentimentStatements were found
                has_sentiment_statements = "sentimentStatements" in results_dict
                logger.info(
                    f"SentimentStatements found in results_dict: {has_sentiment_statements}"
                )

                # If no sentiment statements are provided, extract them from themes and patterns
                sentimentStatements = formatted_results["results"][
                    "sentimentStatements"
                ]
                if (
                    not sentimentStatements["positive"]
                    and not sentimentStatements["neutral"]
                    and not sentimentStatements["negative"]
                ):
                    logger.info(
                        "No sentiment statements found, extracting from themes and patterns"
                    )

                    sentimentStatements = self._extract_sentiment_statements_from_data(
                        formatted_results["results"]["themes"],
                        formatted_results["results"]["patterns"],
                    )

                    formatted_results["results"][
                        "sentimentStatements"
                    ] = sentimentStatements
                    logger.info(
                        f"Extracted sentiment statements: positive={len(sentimentStatements['positive'])}, "
                        + f"neutral={len(sentimentStatements['neutral'])}, "
                        + f"negative={len(sentimentStatements['negative'])}"
                    )

                return formatted_results

            except (json.JSONDecodeError, AttributeError, KeyError) as e:
                logger.error(f"Error formatting results: {str(e)}")
                return {
                    "status": "error",
                    "result_id": analysis_result.result_id,
                    "error": f"Error formatting results: {str(e)}",
                }

        except HTTPException:
            # Re-raise HTTP exceptions
            raise
        except Exception as e:
            logger.error(f"Error retrieving results: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Internal server error: {str(e)}"
            )

    def get_all_analyses(
        self,
        sort_by: Optional[str] = None,
        sort_direction: Optional[Literal["asc", "desc"]] = "desc",
        status: Optional[Literal["pending", "completed", "failed"]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve all analyses for the current user.

        Args:
            sort_by: Field to sort by (createdAt, fileName)
            sort_direction: Sort direction (asc, desc)
            status: Filter by status

        Returns:
            List of formatted analysis results
        """
        try:
            # Log retrieval request
            logger.info(f"list_analyses called - user_id: {self.user.user_id}")
            logger.info(
                f"Request parameters - sortBy: {sort_by}, sortDirection: {sort_direction}, status: {status}"
            )

            # Build the query with user authorization check
            query = (
                self.db.query(AnalysisResult)
                .join(InterviewData)
                .filter(InterviewData.user_id == self.user.user_id)
            )

            # Apply status filter if provided
            if status:
                query = query.filter(AnalysisResult.status == status)

            # Apply sorting
            if sort_by == "createdAt" or sort_by is None:
                # Default sorting by creation date
                if sort_direction == "asc":
                    query = query.order_by(AnalysisResult.analysis_date.asc())
                else:
                    query = query.order_by(AnalysisResult.analysis_date.desc())
            elif sort_by == "fileName":
                # Sorting by filename requires joining with InterviewData
                if sort_direction == "asc":
                    query = query.order_by(InterviewData.filename.asc())
                else:
                    query = query.order_by(InterviewData.filename.desc())

            # Execute query
            analysis_results = query.all()

            # Format the results
            formatted_results = []
            for result in analysis_results:
                # Skip results with no data
                if not result or not result.interview_data:
                    continue

                # Format data to match frontend schema
                formatted_result = self._format_analysis_list_item(result)
                formatted_results.append(formatted_result)

            logger.info(
                f"Returning {len(formatted_results)} analyses for user {self.user.user_id}"
            )

            return formatted_results

        except Exception as e:
            logger.error(f"Error retrieving analyses: {str(e)}")
            raise HTTPException(
                status_code=500, detail=f"Internal server error: {str(e)}"
            )

    def _ensure_personas_present(
        self, results_dict: Dict[str, Any], result_id: int
    ) -> None:
        """
        Ensure personas are present in the results dictionary.
        Instead of querying the personas table, this extracts personas directly from the results JSON.

        Args:
            results_dict: Analysis results dictionary to modify
            result_id: ID of the analysis result
        """
        # Log the method call for debugging
        logger.info(f"_ensure_personas_present called with result_id: {result_id}")

        # Check if personas are already in the results dictionary
        if "personas" in results_dict and results_dict["personas"]:
            persona_count = len(results_dict.get("personas", []))
            logger.info(f"Found {persona_count} personas already in results dictionary")
            return  # Personas already exist in the results, no need to modify

        # No personas in the results dict, initialize empty array
        # Note: We're not adding mock personas anymore since we want real data only
        logger.info(
            f"No personas found in results dictionary for result_id: {result_id}"
        )
        results_dict["personas"] = []

    def _format_analysis_list_item(self, result: AnalysisResult) -> Dict[str, Any]:
        """
        Format a single analysis result for the list view.

        Args:
            result: AnalysisResult database record

        Returns:
            Formatted result for API response
        """
        # Format data to match frontend schema
        formatted_result = {
            "id": str(result.result_id),
            "status": result.status,
            "createdAt": result.analysis_date.isoformat(),
            "fileName": (
                result.interview_data.filename if result.interview_data else "Unknown"
            ),
            "fileSize": None,  # We don't store this currently
            "themes": [],
            "enhanced_themes": [],  # Initialize empty enhanced themes list
            "patterns": [],
            "sentimentOverview": DEFAULT_SENTIMENT_OVERVIEW,
            "sentiment": [],
            "personas": [],  # Initialize empty personas list
        }

        # Add results data if available
        if result.results:
            try:
                # Parse results data
                results_data = (
                    json.loads(result.results)
                    if isinstance(result.results, str)
                    else result.results
                )

                if isinstance(results_data, dict):
                    if "themes" in results_data and isinstance(
                        results_data["themes"], list
                    ):
                        formatted_result["themes"] = results_data["themes"]
                    if "enhanced_themes" in results_data and isinstance(
                        results_data["enhanced_themes"], list
                    ):
                        formatted_result["enhanced_themes"] = results_data[
                            "enhanced_themes"
                        ]
                    if "patterns" in results_data and isinstance(
                        results_data["patterns"], list
                    ):
                        formatted_result["patterns"] = results_data["patterns"]
                    if "sentimentOverview" in results_data and isinstance(
                        results_data["sentimentOverview"], dict
                    ):
                        formatted_result["sentimentOverview"] = results_data[
                            "sentimentOverview"
                        ]
                    if "sentiment" in results_data:
                        formatted_result["sentiment"] = (
                            results_data["sentiment"]
                            if isinstance(results_data["sentiment"], list)
                            else []
                        )
                    # Add personas if available
                    if "personas" in results_data:
                        formatted_result["personas"] = (
                            results_data["personas"]
                            if isinstance(results_data["personas"], list)
                            else []
                        )

                    # Add error info if available
                    if result.status == "failed" and "error" in results_data:
                        formatted_result["error"] = results_data["error"]
            except (json.JSONDecodeError, TypeError) as e:
                logger.error(f"Error parsing results data: {str(e)}")

        # Map API status to schema status values
        if result.status == "processing":
            formatted_result["status"] = "pending"  # Match schema requirements
        elif result.status == "error":
            formatted_result["status"] = "failed"  # Match schema requirements

        return formatted_result

    def _map_json_to_persona_schema(self, p_data: Dict[str, Any]):
        """
        Map JSON persona data to a proper PersonaSchema object

        Args:
            p_data: Persona data from JSON

        Returns:
            PersonaSchema object
        """
        from backend.schemas import PersonaTrait, Persona as PersonaSchema

        # Extract fields with safe fallbacks
        name = p_data.get("name", "Unknown")
        description = p_data.get("description", name)
        confidence = p_data.get("confidence", 0.5)
        patterns = p_data.get("patterns", [])
        evidence = p_data.get("evidence", [])
        metadata = p_data.get("metadata", {})

        # Extract nested traits or use empty defaults
        role_context_data = p_data.get("role_context", {})
        key_resp_data = p_data.get("key_responsibilities", {})
        tools_data = p_data.get("tools_used", {})
        collab_style_data = p_data.get("collaboration_style", {})
        analysis_approach_data = p_data.get("analysis_approach", {})
        pain_points_data = p_data.get("pain_points", {})

        # Create and return persona schema object
        persona = PersonaSchema(
            name=name,
            description=description,
            role_context=PersonaTrait(
                value=role_context_data.get("value", {}),
                confidence=role_context_data.get("confidence", confidence),
                evidence=role_context_data.get("evidence", evidence),
            ),
            key_responsibilities=PersonaTrait(
                value=key_resp_data.get("value", []),
                confidence=key_resp_data.get("confidence", confidence),
                evidence=key_resp_data.get("evidence", evidence),
            ),
            tools_used=PersonaTrait(
                value=tools_data.get("value", {}),
                confidence=tools_data.get("confidence", confidence),
                evidence=tools_data.get("evidence", evidence),
            ),
            collaboration_style=PersonaTrait(
                value=collab_style_data.get("value", {}),
                confidence=collab_style_data.get("confidence", confidence),
                evidence=collab_style_data.get("evidence", evidence),
            ),
            analysis_approach=PersonaTrait(
                value=analysis_approach_data.get("value", {}),
                confidence=analysis_approach_data.get("confidence", confidence),
                evidence=analysis_approach_data.get("evidence", evidence),
            ),
            pain_points=PersonaTrait(
                value=pain_points_data.get("value", []),
                confidence=pain_points_data.get("confidence", confidence),
                evidence=pain_points_data.get("evidence", evidence),
            ),
            patterns=patterns,
            confidence=confidence,
            evidence=evidence,
            metadata=metadata,
        )
        return persona

    def _store_persona_in_db(self, p_data: Dict[str, Any], result_id: int) -> None:
        """
        Store persona data in the database for future retrieval.
        This is a background process that doesn't affect the current request.

        Args:
            p_data: Persona data from JSON
            result_id: Analysis result ID
        """
        from backend.models import Persona

        # Extract fields with safe fallbacks
        name = p_data.get("name", "Unknown")

        # Check if this persona already exists in the database
        existing = (
            self.db.query(Persona)
            .filter(Persona.result_id == result_id, Persona.name == name)
            .first()
        )

        if existing:
            logger.info(
                f"Persona '{name}' already exists in database for result_id: {result_id}"
            )
            return

        # Extract data for DB fields
        role_context = p_data.get("role_context", {})
        demographics = (
            role_context.get("value", {}) if isinstance(role_context, dict) else {}
        )

        key_resp = p_data.get("key_responsibilities", {})
        goals = key_resp.get("value", []) if isinstance(key_resp, dict) else []

        tools = p_data.get("tools_used", {})
        behaviors = tools.get("value", {}) if isinstance(tools, dict) else {}

        pain_points = p_data.get("pain_points", {})
        pain_points_value = (
            pain_points.get("value", []) if isinstance(pain_points, dict) else []
        )

        quotes = p_data.get("quotes", [])
        confidence = p_data.get("confidence", 0.5)

        collab_style = p_data.get("collaboration_style", {})
        collab_style_value = (
            collab_style.get("value", {}) if isinstance(collab_style, dict) else {}
        )

        analysis_approach = p_data.get("analysis_approach", {})
        analysis_approach_value = (
            analysis_approach.get("value", {})
            if isinstance(analysis_approach, dict)
            else {}
        )

        patterns = p_data.get("patterns", [])
        evidence = p_data.get("evidence", [])
        metadata = p_data.get("metadata", {})

        # Create new persona record
        new_persona = Persona(
            result_id=result_id,
            name=name,
            demographics=json.dumps(demographics),
            goals=json.dumps(goals),
            pain_points=json.dumps(pain_points_value),
            behaviors=json.dumps(behaviors),
            quotes=json.dumps(quotes),
            confidence_score=confidence,
            collaboration_style=json.dumps(collab_style_value),
            analysis_approach=json.dumps(analysis_approach_value),
            patterns=json.dumps(patterns),
            evidence=json.dumps(evidence),
            persona_metadata=json.dumps(metadata),
        )

        # Add to database
        try:
            self.db.add(new_persona)
            self.db.commit()
            logger.info(
                f"Persona '{name}' saved to database for result_id: {result_id}"
            )
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error saving persona '{name}' to database: {str(e)}")

    def _extract_sentiment_statements_from_data(
        self, themes, patterns
    ) -> Dict[str, List[str]]:
        """
        Extract sentiment statements from themes and patterns data.
        This is a fallback when the LLM doesn't directly generate sentiment statements.

        Args:
            themes: List of theme objects
            patterns: List of pattern objects

        Returns:
            Dictionary with lists of positive, neutral, and negative statements
        """
        sentiment_statements = {"positive": [], "neutral": [], "negative": []}

        # Process themes based on their sentiment scores
        for theme in themes:
            # Skip themes without statements or sentiment
            if not theme.get("statements") or "sentiment" not in theme:
                continue

            sentiment_score = theme.get("sentiment", 0)
            statements = theme.get("statements", []) or theme.get("examples", [])

            # Use all statements from each theme, not just 2
            for statement in statements:
                # Only add unique statements
                if (
                    sentiment_score > 0.3
                    and statement not in sentiment_statements["positive"]
                ):
                    sentiment_statements["positive"].append(statement)
                elif (
                    sentiment_score < -0.3
                    and statement not in sentiment_statements["negative"]
                ):
                    sentiment_statements["negative"].append(statement)
                elif statement not in sentiment_statements["neutral"]:
                    sentiment_statements["neutral"].append(statement)

        # Process patterns to supplement the statements
        for pattern in patterns:
            # Skip patterns without examples or sentiment
            if not pattern.get("examples") and not pattern.get("evidence"):
                continue

            sentiment_score = pattern.get("sentiment", 0)
            statements = pattern.get("examples", []) or pattern.get("evidence", [])

            # Use all statements from each pattern, not just 1
            for statement in statements:
                # Only add unique statements
                if (
                    sentiment_score > 0.3
                    and statement not in sentiment_statements["positive"]
                ):
                    sentiment_statements["positive"].append(statement)
                elif (
                    sentiment_score < -0.3
                    and statement not in sentiment_statements["negative"]
                ):
                    sentiment_statements["negative"].append(statement)
                elif statement not in sentiment_statements["neutral"]:
                    sentiment_statements["neutral"].append(statement)

        # Limit to 15 statements per category (instead of 5)
        sentiment_statements["positive"] = sentiment_statements["positive"][:15]
        sentiment_statements["neutral"] = sentiment_statements["neutral"][:15]
        sentiment_statements["negative"] = sentiment_statements["negative"][:15]

        return sentiment_statements
