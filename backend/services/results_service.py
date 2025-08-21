from fastapi import HTTPException
from sqlalchemy.orm import Session
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Literal
from sqlalchemy import desc, asc

from backend.models import User, InterviewData, AnalysisResult, Persona
from backend.utils.timezone_utils import format_iso_utc

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
                .join(InterviewData, AnalysisResult.data_id == InterviewData.id)
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
                            logger.error(
                                f"Error mapping persona from JSON: {str(e)}",
                                exc_info=True,
                            )
                            # Log the problematic persona data structure
                            logger.debug(f"Problematic persona data: {p_data}")
                            if isinstance(p_data, dict):
                                logger.debug(
                                    f"Persona data keys: {list(p_data.keys())}"
                                )
                                # Check for missing or None trait fields
                                for trait_field in [
                                    "demographics",
                                    "goals_and_motivations",
                                    "skills_and_expertise",
                                    "workflow_and_environment",
                                    "challenges_and_frustrations",
                                    "needs_and_desires",
                                    "technology_and_tools",
                                    "attitude_towards_research",
                                    "attitude_towards_ai",
                                    "role_context",
                                    "key_responsibilities",
                                    "tools_used",
                                    "collaboration_style",
                                    "analysis_approach",
                                    "pain_points",
                                ]:
                                    trait_value = p_data.get(trait_field)
                                    if trait_value is None:
                                        logger.debug(
                                            f"Trait field '{trait_field}' is None"
                                        )
                                    elif not isinstance(trait_value, dict):
                                        logger.debug(
                                            f"Trait field '{trait_field}' is not a dictionary: {type(trait_value)}"
                                        )

                # Create formatted response (flattened structure to match frontend expectations)
                formatted_results = {
                    "status": "completed",
                    "result_id": analysis_result.result_id,
                    "id": str(
                        analysis_result.result_id
                    ),  # Add id field for frontend compatibility
                    "analysis_date": analysis_result.analysis_date,
                    "createdAt": format_iso_utc(
                        analysis_result.analysis_date
                    ),  # Add createdAt field for frontend compatibility
                    "fileName": self._get_filename_for_result(analysis_result),
                    "fileSize": None,  # We don't store this currently
                    "llmProvider": analysis_result.llm_provider,
                    "llmModel": analysis_result.llm_model,
                    # Flatten the results structure to match frontend expectations
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
                    # OPTION C: Provide stakeholder metadata for UI visualization while hiding sensitive details
                    "stakeholder_intelligence": (
                        self._create_ui_safe_stakeholder_intelligence(
                            analysis_result.stakeholder_intelligence
                        )
                        if analysis_result.stakeholder_intelligence
                        else {
                            "debug": f"stakeholder_intelligence is falsy: {analysis_result.stakeholder_intelligence}"
                        }
                    ),
                }

                # Log whether sentimentStatements were found
                has_sentiment_statements = "sentimentStatements" in results_dict
                logger.info(
                    f"SentimentStatements found in results_dict: {has_sentiment_statements}"
                )

                # If no sentiment statements are provided, extract them from themes and patterns
                sentimentStatements = formatted_results["sentimentStatements"]
                if (
                    not sentimentStatements["positive"]
                    and not sentimentStatements["neutral"]
                    and not sentimentStatements["negative"]
                ):
                    logger.info(
                        "No sentiment statements found, extracting from themes and patterns"
                    )

                    sentimentStatements = self._extract_sentiment_statements_from_data(
                        formatted_results["themes"],
                        formatted_results["patterns"],
                    )

                    formatted_results["sentimentStatements"] = sentimentStatements
                    logger.info(
                        f"Extracted sentiment statements: positive={len(sentimentStatements['positive'])}, "
                        + f"neutral={len(sentimentStatements['neutral'])}, "
                        + f"negative={len(sentimentStatements['negative'])}"
                    )

                # Return the formatted results wrapped in the expected ResultResponse structure
                return {
                    "status": "completed",
                    "result_id": analysis_result.result_id,
                    "analysis_date": analysis_result.analysis_date,
                    "results": formatted_results,  # Wrap the analysis data in 'results' field
                    "llm_provider": analysis_result.llm_provider,
                    "llm_model": analysis_result.llm_model,
                }

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
                if not result:
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

    def _get_filename_for_result(self, analysis_result: AnalysisResult) -> str:
        """
        Get filename for analysis result through direct query instead of relationship.

        Args:
            analysis_result: AnalysisResult database record

        Returns:
            Filename or "Unknown" if not found
        """
        if analysis_result.data_id:
            interview_data = (
                self.db.query(InterviewData)
                .filter(InterviewData.id == analysis_result.data_id)
                .first()
            )
            if interview_data:
                return interview_data.filename or "Unknown"
        return "Unknown"

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
            "createdAt": format_iso_utc(result.analysis_date),
            "fileName": self._get_filename_for_result(result),
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

    def _convert_enhanced_persona_to_frontend_format(
        self, persona_dict: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Convert EnhancedPersona format to frontend-compatible format.

        This ensures that EnhancedPersonaTrait objects are properly serialized
        as simple dictionaries that the frontend can understand.
        """
        # List of trait fields that need conversion
        trait_fields = [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "skills_and_expertise",
            "workflow_and_environment",
            "pain_points",
            "technology_and_tools",
            "collaboration_style",
            "needs_and_desires",
            "attitude_towards_research",
            "attitude_towards_ai",
            "role_context",
            "key_responsibilities",
            "tools_used",
            "analysis_approach",
        ]

        # Convert trait fields from EnhancedPersonaTrait to simple dict
        for field in trait_fields:
            if field in persona_dict and persona_dict[field] is not None:
                trait = persona_dict[field]
                if isinstance(trait, dict):
                    # Ensure the trait has the expected structure
                    persona_dict[field] = {
                        "value": trait.get("value", ""),
                        "confidence": trait.get("confidence", 0.7),
                        "evidence": trait.get("evidence", []),
                    }

        # Ensure stakeholder_intelligence is properly formatted
        if (
            "stakeholder_intelligence" in persona_dict
            and persona_dict["stakeholder_intelligence"]
        ):
            si = persona_dict["stakeholder_intelligence"]
            if isinstance(si, dict):
                # Ensure influence_metrics is properly formatted
                if "influence_metrics" in si and si["influence_metrics"]:
                    im = si["influence_metrics"]
                    if isinstance(im, dict):
                        persona_dict["stakeholder_intelligence"][
                            "influence_metrics"
                        ] = {
                            "decision_power": im.get("decision_power", 0.5),
                            "technical_influence": im.get("technical_influence", 0.5),
                            "budget_influence": im.get("budget_influence", 0.5),
                        }

        return persona_dict

    def _map_json_to_persona_schema(self, p_data: Dict[str, Any]):
        """
        Map JSON persona data to a proper PersonaSchema object with enhanced field mapping.
        This method maps legacy fields to new fields when the new fields are null,
        ensuring a complete persona profile.

        Args:
            p_data: Persona data from JSON

        Returns:
            PersonaSchema object with all fields populated
        """
        from backend.schemas import PersonaTrait, Persona as PersonaSchema

        # Convert EnhancedPersona format to frontend-compatible format
        p_data = self._convert_enhanced_persona_to_frontend_format(p_data)

        # Helper function to safely create a PersonaTrait with proper defaults
        def create_trait(
            trait_data,
            default_value="Unknown",
            default_confidence=0.5,
            default_evidence=None,
        ):
            """Create a PersonaTrait with proper defaults and type checking"""
            if default_evidence is None:
                default_evidence = []

            # Initialize with defaults
            trait = {
                "value": default_value,
                "confidence": default_confidence,
                "evidence": default_evidence,
            }

            # Only use trait_data if it's a dictionary
            if isinstance(trait_data, dict):
                # Extract value with type checking
                if "value" in trait_data and trait_data["value"] is not None:
                    trait["value"] = str(trait_data["value"])

                # Extract confidence with type checking
                if "confidence" in trait_data and trait_data["confidence"] is not None:
                    try:
                        trait["confidence"] = float(trait_data["confidence"])
                    except (ValueError, TypeError):
                        # Keep default if conversion fails
                        pass

                # Extract evidence with type checking
                if "evidence" in trait_data and isinstance(
                    trait_data["evidence"], list
                ):
                    # Filter out non-string items
                    trait["evidence"] = [
                        str(item) for item in trait_data["evidence"] if item is not None
                    ]

            # Create and return the PersonaTrait
            return PersonaTrait(
                value=trait["value"],
                confidence=trait["confidence"],
                evidence=trait["evidence"],
            )

        # Extract basic fields with safe fallbacks
        name = p_data.get("name", "Unknown")
        description = p_data.get("description", name)
        archetype = p_data.get("archetype")  # May be None

        # Handle confidence with type checking
        try:
            confidence = float(
                p_data.get("confidence", p_data.get("overall_confidence", 0.7))
            )
        except (ValueError, TypeError):
            confidence = 0.7

        # Handle patterns with type checking
        patterns = p_data.get("patterns", [])
        if not isinstance(patterns, list):
            patterns = []

        # Handle evidence with type checking
        evidence = p_data.get("evidence", p_data.get("supporting_evidence_summary", []))
        if not isinstance(evidence, list):
            evidence = []

        # Handle metadata with type checking
        metadata = p_data.get("metadata", p_data.get("persona_metadata", {}))
        if not isinstance(metadata, dict):
            metadata = {}

        # Extract all trait data with empty defaults
        # Legacy fields - ensure they're dictionaries
        role_context_data = p_data.get("role_context")
        key_resp_data = p_data.get("key_responsibilities")
        tools_data = p_data.get("tools_used")
        collab_style_data = p_data.get("collaboration_style")
        analysis_approach_data = p_data.get("analysis_approach")
        pain_points_data = p_data.get("pain_points")

        # New fields - ensure they're dictionaries
        demographics_data = p_data.get("demographics")
        goals_data = p_data.get("goals_and_motivations")
        skills_data = p_data.get("skills_and_expertise")
        workflow_data = p_data.get("workflow_and_environment")
        challenges_data = p_data.get("challenges_and_frustrations")
        needs_data = p_data.get("needs_and_desires")
        tech_tools_data = p_data.get("technology_and_tools")
        research_attitude_data = p_data.get("attitude_towards_research")
        ai_attitude_data = p_data.get("attitude_towards_ai")
        # Handle key_quotes with special care - it could be a list (legacy) or a dict (new format)
        key_quotes_data = p_data.get("key_quotes")
        # If key_quotes is a list, convert it to the new structured format
        if isinstance(key_quotes_data, list) and len(key_quotes_data) > 0:
            key_quotes_data = {
                "value": "Representative quotes from the interview",
                "confidence": 0.9,
                "evidence": key_quotes_data,
            }
        # If key_quotes is empty or missing, create a placeholder
        elif not key_quotes_data:
            # Look for quotes in other fields' evidence
            all_quotes = []
            for field_name in [
                "demographics",
                "goals_and_motivations",
                "skills_and_expertise",
                "challenges_and_frustrations",
                "needs_and_desires",
            ]:
                field_data = p_data.get(field_name, {})
                if isinstance(field_data, dict) and "evidence" in field_data:
                    all_quotes.extend(field_data.get("evidence", []))

            # Use up to 5 quotes from other fields if available
            if all_quotes:
                key_quotes_data = {
                    "value": "Quotes extracted from other fields",
                    "confidence": 0.7,
                    "evidence": all_quotes[:5],
                }
            else:
                key_quotes_data = {"value": "", "confidence": 0.5, "evidence": []}

        # Map legacy fields to new fields when new fields are empty or invalid
        # This ensures we don't lose data when only legacy fields are populated

        # If demographics is empty, populate from role_context
        if not isinstance(demographics_data, dict) and isinstance(
            role_context_data, dict
        ):
            demographics_data = {
                "value": f"Professional with experience in {role_context_data.get('value', 'their field')}",
                "confidence": role_context_data.get("confidence", 0.5),
                "evidence": role_context_data.get("evidence", []),
            }

        # If goals_and_motivations is empty, derive from key_responsibilities
        if not isinstance(goals_data, dict) and isinstance(key_resp_data, dict):
            goals_data = {
                "value": f"Focused on {key_resp_data.get('value', 'professional growth and efficiency')}",
                "confidence": key_resp_data.get("confidence", 0.5),
                "evidence": key_resp_data.get("evidence", []),
            }

        # If skills_and_expertise is empty, derive from key_responsibilities and tools_used
        if not isinstance(skills_data, dict) and (
            isinstance(key_resp_data, dict) or isinstance(tools_data, dict)
        ):
            skills_value = "Skilled in "
            if isinstance(key_resp_data, dict) and key_resp_data.get("value"):
                skills_value += key_resp_data.get("value")
            if isinstance(tools_data, dict) and tools_data.get("value"):
                skills_value += f" using {tools_data.get('value')}"

            # Calculate confidence safely
            key_resp_confidence = (
                key_resp_data.get("confidence", 0.5)
                if isinstance(key_resp_data, dict)
                else 0.5
            )
            tools_confidence = (
                tools_data.get("confidence", 0.5)
                if isinstance(tools_data, dict)
                else 0.5
            )

            # Combine evidence safely
            key_resp_evidence = (
                key_resp_data.get("evidence", [])
                if isinstance(key_resp_data, dict)
                else []
            )
            tools_evidence = (
                tools_data.get("evidence", []) if isinstance(tools_data, dict) else []
            )

            skills_data = {
                "value": skills_value,
                "confidence": max(key_resp_confidence, tools_confidence),
                "evidence": key_resp_evidence + tools_evidence,
            }

        # If workflow_and_environment is empty, derive from collaboration_style
        if not isinstance(workflow_data, dict) and isinstance(collab_style_data, dict):
            workflow_data = {
                "value": f"Works in an environment where {collab_style_data.get('value', 'collaboration is important')}",
                "confidence": collab_style_data.get("confidence", 0.5),
                "evidence": collab_style_data.get("evidence", []),
            }

        # If challenges_and_frustrations is empty, use pain_points
        if not isinstance(challenges_data, dict) and isinstance(pain_points_data, dict):
            challenges_data = {
                "value": pain_points_data.get("value", ""),
                "confidence": pain_points_data.get("confidence", 0.5),
                "evidence": pain_points_data.get("evidence", []),
            }

        # If technology_and_tools is empty, use tools_used
        if not isinstance(tech_tools_data, dict) and isinstance(tools_data, dict):
            tech_tools_data = {
                "value": tools_data.get("value", ""),
                "confidence": tools_data.get("confidence", 0.5),
                "evidence": tools_data.get("evidence", []),
            }

        # Create and return persona schema object with all fields populated using the helper function
        persona = PersonaSchema(
            name=name,
            archetype=archetype or "Professional",  # Provide a default if None
            description=description,
            # Include all new fields with mapping from legacy when needed
            demographics=create_trait(
                demographics_data, "Professional in their field", 0.5
            ),
            goals_and_motivations=create_trait(
                goals_data, "Professional growth and efficiency", 0.5
            ),
            skills_and_expertise=create_trait(
                skills_data, "Domain-specific skills", 0.5
            ),
            workflow_and_environment=create_trait(
                workflow_data, "Professional work environment", 0.5
            ),
            challenges_and_frustrations=create_trait(
                challenges_data, "Common professional challenges", 0.5
            ),
            needs_and_desires=create_trait(
                needs_data, "Efficiency and professional growth", 0.5
            ),
            technology_and_tools=create_trait(
                tech_tools_data, "Technology and tools used", 0.5
            ),
            attitude_towards_research=create_trait(
                research_attitude_data, "Values data-driven approaches", 0.5
            ),
            attitude_towards_ai=create_trait(
                ai_attitude_data, "Open to technological advancements", 0.5
            ),
            key_quotes=create_trait(
                key_quotes_data,
                "Representative quotes from the interview",
                0.7,
                [],  # Empty evidence list as default
            ),
            # Include all legacy fields
            role_context=create_trait(
                role_context_data, "Professional role", confidence, evidence
            ),
            key_responsibilities=create_trait(
                key_resp_data, "Professional responsibilities", confidence, evidence
            ),
            tools_used=create_trait(
                tools_data, "Tools and methods used", confidence, evidence
            ),
            collaboration_style=create_trait(
                collab_style_data, "Collaboration approach", confidence, evidence
            ),
            analysis_approach=create_trait(
                analysis_approach_data,
                "Analysis approach",
                confidence,
                evidence,
            ),
            pain_points=create_trait(
                pain_points_data, "Professional challenges", confidence, evidence
            ),
            # Overall persona information
            patterns=patterns,
            confidence=confidence,
            evidence=evidence,
            metadata=metadata,
        )
        return persona

    def _store_persona_in_db(self, p_data: Dict[str, Any], result_id: int) -> None:
        """
        Store persona data in the database for future retrieval.
        Maps nested JSON structure to SQLAlchemy model with JSON columns.

        Args:
            p_data: Persona data dictionary (likely matching PersonaSchema).
            result_id: Analysis result ID.
        """
        from backend.models import Persona  # Import model locally if needed
        import json  # Ensure json is imported

        # Extract basic fields safely
        name = p_data.get("name", "Unknown Persona")
        description = p_data.get("description", "")
        archetype = p_data.get("archetype")  # Simple string field

        # Check if this exact persona already exists to avoid true duplicates
        # Use name + description + archetype for more specific duplicate detection
        # This allows multiple personas with same name but different characteristics
        try:
            existing = (
                self.db.query(Persona)
                .filter(
                    Persona.result_id == result_id,
                    Persona.name == name,
                    Persona.description == description,
                    Persona.archetype == archetype,
                )
                .first()
            )
            if existing:
                logger.debug(
                    f"Exact persona '{name}' with same description and archetype already in DB for result_id {result_id}. Skipping save."
                )
                return  # Skip saving only if exact match exists
        except Exception as query_err:
            logger.error(
                f"Error checking for existing persona '{name}': {str(query_err)}",
                exc_info=True,
            )
            # Continue to attempt saving, maybe the table structure is partially fixed

        try:
            # Prepare fields for the SQLAlchemy Persona model using json.dumps for JSON columns
            persona_fields = {
                "result_id": result_id,
                "name": name,
                "description": description,
                "archetype": archetype,
                # --- Map Nested Traits to JSON Columns ---
                # Use .get(field, {}) to handle missing traits gracefully
                "role_context": json.dumps(p_data.get("role_context", {})),
                "key_responsibilities": json.dumps(
                    p_data.get("key_responsibilities", {})
                ),
                "tools_used": json.dumps(p_data.get("tools_used", {})),
                "collaboration_style": json.dumps(
                    p_data.get("collaboration_style", {})
                ),
                "analysis_approach": json.dumps(p_data.get("analysis_approach", {})),
                "pain_points": json.dumps(p_data.get("pain_points", {})),
                "demographics": json.dumps(p_data.get("demographics", {})),
                "goals_and_motivations": json.dumps(
                    p_data.get("goals_and_motivations", {})
                ),
                "skills_and_expertise": json.dumps(
                    p_data.get("skills_and_expertise", {})
                ),
                "workflow_and_environment": json.dumps(
                    p_data.get("workflow_and_environment", {})
                ),
                "challenges_and_frustrations": json.dumps(
                    p_data.get("challenges_and_frustrations", {})
                ),
                "needs_and_desires": json.dumps(p_data.get("needs_and_desires", {})),
                "technology_and_tools": json.dumps(
                    p_data.get("technology_and_tools", {})
                ),
                "attitude_towards_research": json.dumps(
                    p_data.get("attitude_towards_research", {})
                ),
                "attitude_towards_ai": json.dumps(
                    p_data.get("attitude_towards_ai", {})
                ),
                "key_quotes": json.dumps(p_data.get("key_quotes", {})),
                # --- Map List/Simple Fields ---
                "patterns": json.dumps(
                    p_data.get("patterns", [])
                ),  # List stored as JSON
                "evidence": json.dumps(
                    p_data.get(
                        "evidence", p_data.get("supporting_evidence_summary", [])
                    )
                ),  # List stored as JSON
                "supporting_evidence_summary": json.dumps(
                    p_data.get(
                        "supporting_evidence_summary", p_data.get("evidence", [])
                    )
                ),  # List stored as JSON
                # Use the correct confidence field name(s) from models.py
                # Ensure it's a float, default to 0.5 if missing/invalid
                "confidence": float(
                    p_data.get("confidence", p_data.get("overall_confidence", 0.5))
                ),
                "overall_confidence": float(
                    p_data.get("overall_confidence", p_data.get("confidence", 0.5))
                ),
                # Map metadata
                "persona_metadata": json.dumps(
                    p_data.get("persona_metadata", p_data.get("metadata", {}))
                ),
            }

            # Filter out fields that might not exist in the current DB model yet
            # This makes the code more resilient to partially applied migrations
            model_columns = {c.name for c in Persona.__table__.columns}
            valid_persona_fields = {
                k: v for k, v in persona_fields.items() if k in model_columns
            }

            # Log which fields are being used
            logger.debug(
                f"Attempting to save persona '{name}' with fields: {list(valid_persona_fields.keys())}"
            )

            # Create the Persona object using only valid fields
            new_persona = Persona(**valid_persona_fields)

            # Add to session and commit
            self.db.add(new_persona)
            self.db.commit()
            logger.info(
                f"Persona '{new_persona.name}' saved to database for result_id: {result_id}"
            )

        except Exception as e:
            self.db.rollback()
            # Log the specific error and the data that caused it
            logger.error(
                f"Error saving persona '{name}' to database: {str(e)}", exc_info=True
            )
            logger.debug(f"Persona data causing error: {p_data}")
            # Do not re-raise, just log the error for this background save attempt

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

        logger.info(
            f"Extracting sentiment statements from {len(themes)} themes and {len(patterns)} patterns"
        )

        # Process themes based on their sentiment scores
        for theme in themes:
            # Skip themes without statements or sentiment
            if not theme.get("statements") or "sentiment" not in theme:
                continue

            sentiment_score = theme.get("sentiment", 0)
            statements = theme.get("statements", []) or theme.get("examples", [])

            # Use all statements from each theme
            for statement in statements:
                # Skip short statements
                if not isinstance(statement, str) or len(statement.strip()) < 20:
                    continue

                # Only add unique statements
                if (
                    sentiment_score > 0.2
                    and statement not in sentiment_statements["positive"]
                ):
                    sentiment_statements["positive"].append(statement)
                elif (
                    sentiment_score < -0.2
                    and statement not in sentiment_statements["negative"]
                ):
                    sentiment_statements["negative"].append(statement)
                elif statement not in sentiment_statements["neutral"]:
                    sentiment_statements["neutral"].append(statement)

        # Process patterns to supplement the statements
        for pattern in patterns:
            # Skip patterns without evidence
            if not pattern.get("evidence"):
                continue

            # Determine sentiment from pattern description or impact
            sentiment_score = pattern.get("sentiment", 0)

            # If no explicit sentiment score, try to infer from impact
            if sentiment_score == 0 and "impact" in pattern:
                impact = pattern.get("impact", "").lower()
                if any(
                    word in impact
                    for word in [
                        "positive",
                        "improves",
                        "enhances",
                        "increases",
                        "strengthens",
                    ]
                ):
                    sentiment_score = 0.5
                elif any(
                    word in impact
                    for word in [
                        "negative",
                        "frustration",
                        "slows",
                        "diminishes",
                        "friction",
                    ]
                ):
                    sentiment_score = -0.5

            statements = pattern.get("evidence", [])

            # Use all statements from each pattern
            for statement in statements:
                # Skip short statements
                if not isinstance(statement, str) or len(statement.strip()) < 20:
                    continue

                # Only add unique statements
                if (
                    sentiment_score > 0.2
                    and statement not in sentiment_statements["positive"]
                ):
                    sentiment_statements["positive"].append(statement)
                elif (
                    sentiment_score < -0.2
                    and statement not in sentiment_statements["negative"]
                ):
                    sentiment_statements["negative"].append(statement)
                elif statement not in sentiment_statements["neutral"]:
                    sentiment_statements["neutral"].append(statement)

        # Limit to 20 statements per category
        sentiment_statements["positive"] = sentiment_statements["positive"][:20]
        sentiment_statements["neutral"] = sentiment_statements["neutral"][:20]
        sentiment_statements["negative"] = sentiment_statements["negative"][:20]

        logger.info(
            f"Extracted sentiment statements: positive={len(sentiment_statements['positive'])}, neutral={len(sentiment_statements['neutral'])}, negative={len(sentiment_statements['negative'])}"
        )

        return sentiment_statements

    def _create_ui_safe_stakeholder_intelligence(self, stakeholder_intelligence):
        """Create UI-safe version of stakeholder intelligence for visualization while hiding sensitive details"""
        if not stakeholder_intelligence:
            return None

        try:
            # Extract detected stakeholders from the stakeholder intelligence data
            detected_stakeholders = []

            # Handle different possible structures of stakeholder_intelligence
            if isinstance(stakeholder_intelligence, dict):
                # Check for direct detected_stakeholders array
                if "detected_stakeholders" in stakeholder_intelligence:
                    detected_stakeholders = stakeholder_intelligence[
                        "detected_stakeholders"
                    ]
                # Check for stakeholders in other possible locations
                elif "stakeholders" in stakeholder_intelligence:
                    stakeholders_data = stakeholder_intelligence["stakeholders"]
                    if isinstance(stakeholders_data, list):
                        detected_stakeholders = stakeholders_data
                    elif isinstance(stakeholders_data, dict):
                        # Convert dict of stakeholders to list format
                        for (
                            stakeholder_id,
                            stakeholder_data,
                        ) in stakeholders_data.items():
                            if isinstance(stakeholder_data, dict):
                                stakeholder_entry = {
                                    "stakeholder_id": stakeholder_id,
                                    "stakeholder_type": stakeholder_data.get(
                                        "stakeholder_type", "primary_customer"
                                    ),
                                    "confidence_score": stakeholder_data.get(
                                        "confidence_score", 0.85
                                    ),
                                    "individual_insights": stakeholder_data.get(
                                        "individual_insights", {}
                                    ),
                                    "influence_metrics": stakeholder_data.get(
                                        "influence_metrics", {}
                                    ),
                                    # Preserve full persona data if available (Option C)
                                    "full_persona_data": stakeholder_data.get(
                                        "full_persona_data"
                                    ),
                                }
                                detected_stakeholders.append(stakeholder_entry)

                # Create UI-safe structure
                ui_safe_intelligence = {
                    "detected_stakeholders": detected_stakeholders,
                    "total_stakeholders": len(detected_stakeholders),
                    "processing_metadata": {
                        "analysis_type": "multi_stakeholder",
                        "confidence_threshold": 0.7,
                        "ui_safe": True,
                    },
                }

                # Add cross-stakeholder patterns if available
                if "cross_stakeholder_patterns" in stakeholder_intelligence:
                    patterns = stakeholder_intelligence["cross_stakeholder_patterns"]
                    if isinstance(patterns, dict):
                        ui_safe_intelligence["cross_stakeholder_patterns"] = {
                            "consensus_areas": patterns.get("consensus_areas", []),
                            "conflict_zones": patterns.get("conflict_zones", []),
                            "influence_networks": patterns.get(
                                "influence_networks", []
                            ),
                        }

                # Add summary if available
                if "multi_stakeholder_summary" in stakeholder_intelligence:
                    summary = stakeholder_intelligence["multi_stakeholder_summary"]
                    if isinstance(summary, dict):
                        ui_safe_intelligence["multi_stakeholder_summary"] = {
                            "key_insights": summary.get("key_insights", []),
                            "business_implications": summary.get(
                                "business_implications", []
                            ),
                            "recommended_actions": summary.get(
                                "recommended_actions", []
                            ),
                        }

                return ui_safe_intelligence

            else:
                # Fallback for non-dict stakeholder_intelligence
                return {
                    "detected_stakeholders": [],
                    "total_stakeholders": 0,
                    "processing_metadata": {
                        "analysis_type": "single_stakeholder",
                        "ui_safe": True,
                        "fallback_reason": f"Unexpected stakeholder_intelligence type: {type(stakeholder_intelligence)}",
                    },
                }

        except Exception as e:
            logger.error(f"Error creating UI-safe stakeholder intelligence: {e}")
            return {
                "detected_stakeholders": [],
                "total_stakeholders": 0,
                "processing_metadata": {
                    "analysis_type": "error",
                    "ui_safe": True,
                    "error": str(e),
                },
            }
