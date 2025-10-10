from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Literal


import re

from backend.models import User, InterviewData, AnalysisResult
from backend.utils.timezone_utils import format_iso_utc
from backend.services.results.persona_transformers import (
    convert_enhanced_persona_to_frontend_format,
    map_json_to_persona_schema,
    serialize_field_safely,
    store_persona_in_db,
)

# Configure logging
logger = logging.getLogger(__name__)

# Default sentiment values when none are available
DEFAULT_SENTIMENT_OVERVIEW = {"positive": 0.33, "neutral": 0.34, "negative": 0.33}


class ResultsService:
    """
    Service class for handling retrieval and formatting of analysis results.
    """

    def __init__(self, db: Session, user: "User"):
        """
        Initialize the ResultsService with database session and user.

        Args:
            db (Session): SQLAlchemy database session
            user (User): Current authenticated user
        """
        self.db = db
        self.user = user

    # -----------------------------

    # -----------------------------

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
                    from backend.domain.models.production_persona import (
                        PersonaAPIResponse,
                        transform_to_frontend_format,
                        validate_persona_data_safe,
                    )

                    # Log persona count for debugging
                    logger.info(
                        f"Found {len(results_dict['personas'])} personas in results JSON"
                    )

                    # Helper moved to results/formatters to aid decoupling
                    from backend.services.results.formatters import (
                        compute_influence_metrics_for_persona as _compute_influence_metrics_for_persona,
                    )

                    # Process each persona from JSON with validation
                    for p_data in results_dict["personas"]:
                        try:
                            if not isinstance(p_data, dict):
                                logger.warning(
                                    f"Skipping non-dict persona data: {type(p_data)}"
                                )
                                continue

                            # Transform to frontend format and validate
                            transformed_persona = transform_to_frontend_format(p_data)

                            # Ensure top-level confidence is numeric (fallback from overall_confidence)
                            try:
                                raw_conf = transformed_persona.get(
                                    "confidence",
                                    transformed_persona.get("overall_confidence", 0.7),
                                )
                                transformed_persona["confidence"] = float(raw_conf)
                            except Exception:
                                transformed_persona["confidence"] = 0.7

                            # ADDITIONAL FIX: Generate structured_demographics if missing
                            if "structured_demographics" not in transformed_persona:
                                logger.info(
                                    f"[STRUCTURED_DEMOGRAPHICS_DIRECT_FIX] Adding structured_demographics for: {transformed_persona.get('name', 'Unknown')}"
                                )
                                demographics_field = transformed_persona.get(
                                    "demographics"
                                )
                                if demographics_field and isinstance(
                                    demographics_field, dict
                                ):
                                    if demographics_field.get(
                                        "value"
                                    ) and demographics_field.get("evidence"):
                                        try:
                                            # Import here to avoid circular imports
                                            from backend.services.processing.persona_builder import (
                                                PersonaBuilder,
                                            )
                                            from backend.domain.models.persona_schema import (
                                                PersonaTrait,
                                            )

                                            # Convert to PersonaTrait first
                                            demographics_trait = PersonaTrait(
                                                value=demographics_field.get(
                                                    "value", ""
                                                ),
                                                confidence=demographics_field.get(
                                                    "confidence", 0.7
                                                ),
                                                evidence=demographics_field.get(
                                                    "evidence", []
                                                ),
                                            )

                                            # Convert to StructuredDemographics
                                            builder = PersonaBuilder()
                                            structured_demographics = builder._convert_demographics_to_structured(
                                                demographics_trait
                                            )

                                            # Add to persona data
                                            transformed_persona[
                                                "structured_demographics"
                                            ] = structured_demographics.model_dump()

                                            logger.info(
                                                f"[STRUCTURED_DEMOGRAPHICS_DIRECT_FIX] Successfully generated structured_demographics for: {transformed_persona.get('name', 'Unknown')}"
                                            )

                                        except Exception as e:
                                            logger.warning(
                                                f"[STRUCTURED_DEMOGRAPHICS_DIRECT_FIX] Failed to generate structured_demographics: {e}"
                                            )

                            # Ensure stakeholder influence metrics exist and are not all defaults
                            si = (
                                transformed_persona.get("stakeholder_intelligence")
                                or {}
                            )
                            from backend.services.results.formatters import (
                                should_compute_influence_metrics,
                            )

                            needs_compute = should_compute_influence_metrics(si)
                            if needs_compute:
                                computed = _compute_influence_metrics_for_persona(
                                    transformed_persona
                                )
                                if not isinstance(si, dict):
                                    si = {}
                                si["influence_metrics"] = computed
                                transformed_persona["stakeholder_intelligence"] = si

                            # Validate the transformed persona
                            if validate_persona_data_safe(transformed_persona):
                                persona_list.append(transformed_persona)
                                logger.debug(
                                    f"✅ Validated and added persona: {transformed_persona.get('name', 'Unknown')}"
                                )
                            else:
                                logger.warning(
                                    f"⚠️ Persona failed validation: {p_data.get('name', 'Unknown')}"
                                )
                                # Still add it but log the issue
                                persona_list.append(transformed_persona)

                            # Store this persona in the database for future use
                            # This won't affect current request but prepares for future schema changes
                            # Not blocking the request if this fails, just logging errors
                            try:
                                store_persona_in_db(self.db, p_data, result_id)
                            except Exception as store_err:
                                logger.error(
                                    f"Error storing persona in DB: {str(store_err)}"
                                )

                        except Exception as e:
                            logger.error(
                                f"Error processing persona from JSON: {str(e)}",
                                exc_info=True,
                            )
                            # Log the problematic persona data structure
                            logger.debug(f"Problematic persona data: {p_data}")
                            if isinstance(p_data, dict):
                                logger.debug(
                                    f"Persona data keys: {list(p_data.keys())}"
                                )

                    # Validate the final persona list using PersonaAPIResponse
                    try:
                        validated_response = PersonaAPIResponse(
                            personas=persona_list,
                            metadata={
                                "result_id": result_id,
                                "count": len(persona_list),
                                "validation_timestamp": datetime.now().isoformat(),
                            },
                        )
                        logger.info(
                            f"✅ PersonaAPIResponse validation passed for {len(persona_list)} personas"
                        )
                    except Exception as validation_error:
                        logger.error(
                            f"❌ PersonaAPIResponse validation failed: {validation_error}"
                        )
                        # Log additional details about the validation failure
                        if persona_list:
                            first_persona = persona_list[0]
                            logger.error(
                                f"First persona keys: {list(first_persona.keys()) if isinstance(first_persona, dict) else 'Not a dict'}"
                            )
                            if (
                                isinstance(first_persona, dict)
                                and "key_quotes" in first_persona
                            ):
                                logger.error(
                                    f"key_quotes structure: {type(first_persona['key_quotes'])} - {first_persona['key_quotes']}"
                                )
                        # Continue anyway but log the issue - validation shouldn't block persona delivery

                # Phase 0 additions: build SSoT personas, source payload, and validation placeholders
                personas_ssot: List[Dict[str, Any]] = []
                try:
                    from backend.services.adapters.persona_adapters import (
                        to_ssot_persona,
                    )

                    for p in results_dict.get("personas", []) or []:
                        if isinstance(p, dict):
                            personas_ssot.append(to_ssot_persona(p))
                except Exception as e:
                    logger.warning(f"SSoT adapter failed: {e}")

                # Attach source with priority: transcript > original_text > dataId
                source_payload: Dict[str, Any] = {}
                try:
                    from backend.services.results.formatters import build_source_payload

                    source_payload = build_source_payload(
                        results_dict, analysis_result.data_id
                    )
                except Exception as e:
                    logger.warning(f"Could not attach source payload: {e}")

                # Evidence attribution filtering: remove Researcher quotes from persona evidence
                try:
                    if personas_ssot:
                        from backend.services.results.formatters import (
                            filter_researcher_evidence_for_ssot,
                            inject_age_ranges_from_source,
                        )

                        personas_ssot = filter_researcher_evidence_for_ssot(
                            personas_ssot,
                            source_payload.get("transcript"),
                            source_payload.get("original_text"),
                        )
                        # Inject missing age ranges from source text/transcript
                        personas_ssot = inject_age_ranges_from_source(
                            personas_ssot,
                            transcript=source_payload.get("transcript"),
                            original_text=source_payload.get("original_text"),
                        )
                except Exception as e:
                    logger.warning(
                        f"Failed to apply evidence attribution filtering: {e}"
                    )

                # Compute validation using PersonaEvidenceValidator with transcript-aware matching
                validation_summary = None
                validation_status = None
                confidence_components = None
                try:
                    if personas_ssot:
                        from backend.services.validation.persona_evidence_validator import (
                            PersonaEvidenceValidator,
                        )

                        validator = PersonaEvidenceValidator()
                        all_matches = []
                        all_dup = {"duplicates": [], "cross_trait_reuse": []}
                        transcript = source_payload.get("transcript")
                        original_text = source_payload.get("original_text") or ""

                        for p in personas_ssot:
                            if not isinstance(p, dict):
                                continue
                            matches = validator.match_evidence(
                                persona_ssot=p,
                                source_text=original_text,
                                transcript=(
                                    transcript if isinstance(transcript, list) else None
                                ),
                            )
                            all_matches.extend(matches)
                            dup = validator.detect_duplication(p)
                            # Merge duplication info
                            all_dup["duplicates"].extend(dup.get("duplicates", []))
                            all_dup["cross_trait_reuse"].extend(
                                dup.get("cross_trait_reuse", [])
                            )
                        speaker_check = (
                            validator.check_speaker_consistency(
                                p, transcript if isinstance(transcript, list) else None
                            )
                            if personas_ssot
                            else {"speaker_mismatches": []}
                        )
                        contamination = validator.detect_contamination(personas_ssot)
                        summary = validator.summarize(
                            all_matches,
                            duplication=all_dup,
                            speaker_check=speaker_check,
                            contamination=contamination,
                        )
                        validation_summary = {
                            "counts": summary.get("counts", {}),
                            "method": "persona_evidence_validator_v1",
                            "speaker_mismatches": len(
                                summary.get("speaker_check", {}).get(
                                    "speaker_mismatches", []
                                )
                            ),
                            "contamination": summary.get("contamination", {}),
                        }
                        status = validator.compute_status(summary)
                        validation_status = "pass" if status == "PASS" else "warning"
                        confidence_components = validator.compute_confidence_components(
                            summary
                        )
                except Exception as e:
                    logger.warning(f"Validation summary computation failed: {e}")

                # Feature flag for future enforcement (Phase 1)
                try:
                    import os

                    validation_enforcement = (
                        os.getenv("PERSONA_VALIDATION_ENFORCEMENT", "false").lower()
                        == "true"
                    )
                except Exception:
                    validation_enforcement = False

                # Create formatted response (flattened structure to match frontend expectations)
                from backend.services.results.formatters import (
                    assemble_flattened_results,
                    get_filename_for_data_id,
                    create_ui_safe_stakeholder_intelligence,
                    adjust_theme_frequencies_for_prevalence,
                )

                flattened = assemble_flattened_results(
                    results_dict,
                    persona_list,
                    sentiment_overview_default=DEFAULT_SENTIMENT_OVERVIEW,
                )

                # Fix mis-scaled theme frequencies that look like normalized weights (sum≈1)
                try:
                    if isinstance(flattened.get("themes"), list):
                        try:
                            # Prefer prevalence from persona evidence coverage when available
                            from backend.services.results.formatters import (
                                adjust_theme_frequencies_with_persona_evidence,
                            )

                            flattened["themes"] = (
                                adjust_theme_frequencies_with_persona_evidence(
                                    flattened["themes"], personas_ssot
                                )
                            )
                        except Exception:
                            flattened["themes"] = (
                                adjust_theme_frequencies_for_prevalence(
                                    flattened["themes"]
                                )
                            )
                    if isinstance(flattened.get("enhanced_themes"), list):
                        try:
                            from backend.services.results.formatters import (
                                adjust_theme_frequencies_with_persona_evidence,
                            )

                            flattened["enhanced_themes"] = (
                                adjust_theme_frequencies_with_persona_evidence(
                                    flattened["enhanced_themes"], personas_ssot
                                )
                            )
                        except Exception:
                            flattened["enhanced_themes"] = (
                                adjust_theme_frequencies_for_prevalence(
                                    flattened["enhanced_themes"]
                                )
                            )
                except Exception:
                    pass

                enable_ms = (
                    os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true"
                )
                formatted_results = {
                    "status": "completed",
                    "result_id": analysis_result.result_id,
                    "id": str(analysis_result.result_id),  # frontend compatibility
                    "analysis_date": analysis_result.analysis_date,
                    "createdAt": format_iso_utc(analysis_result.analysis_date),
                    "fileName": get_filename_for_data_id(
                        self.db, analysis_result.data_id
                    ),
                    "fileSize": None,
                    "llmProvider": analysis_result.llm_provider,
                    "llmModel": analysis_result.llm_model,
                    **flattened,
                }
                if enable_ms and analysis_result.stakeholder_intelligence:
                    formatted_results["stakeholder_intelligence"] = (
                        create_ui_safe_stakeholder_intelligence(
                            analysis_result.stakeholder_intelligence
                        )
                    )

                # Extend formatted_results with SSoT and validation fields
                try:
                    formatted_results["personas_ssot"] = personas_ssot
                    formatted_results["source"] = source_payload
                    formatted_results["validation_summary"] = validation_summary
                    formatted_results["validation_status"] = validation_status
                    formatted_results["confidence_components"] = confidence_components
                    formatted_results["validation_enforcement"] = validation_enforcement
                except Exception as e:
                    logger.warning(f"Failed to attach SSoT/validation fields: {e}")

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

                    from backend.services.results.formatters import (
                        extract_sentiment_statements_from_data,
                    )

                    sentimentStatements = extract_sentiment_statements_from_data(
                        formatted_results["themes"], formatted_results["patterns"]
                    )

                    formatted_results["sentimentStatements"] = sentimentStatements
                    logger.info(
                        f"Extracted sentiment statements: positive={len(sentimentStatements['positive'])}, "
                        + f"neutral={len(sentimentStatements['neutral'])}, "
                        + f"negative={len(sentimentStatements['negative'])}"
                    )

                # Ensure stakeholder_intelligence.detected_stakeholders is populated (only if enabled)
                try:
                    if os.getenv("ENABLE_MULTI_STAKEHOLDER", "false").lower() == "true":
                        si = formatted_results.get("stakeholder_intelligence")
                        if isinstance(si, dict):
                            detected = si.get("detected_stakeholders")
                            if not detected:
                                from backend.services.results.formatters import (
                                    derive_detected_stakeholders_from_personas,
                                )

                                derived = derive_detected_stakeholders_from_personas(
                                    persona_list
                                )
                                si["detected_stakeholders"] = derived
                except Exception as e:
                    logger.warning(
                        f"Failed to derive detected_stakeholders from personas: {e}"
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

    def _get_filename_for_result(self, analysis_result: "AnalysisResult") -> str:
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

    def _format_analysis_list_item(self, result: "AnalysisResult") -> Dict[str, Any]:
        """
        Format a single analysis result for the list view.

        Args:
            result: AnalysisResult database record

        Returns:
            Formatted result for API response
        """
        # Format data to match frontend schema
        from backend.services.results.formatters import get_filename_for_data_id

        formatted_result = {
            "id": str(result.result_id),
            "status": result.status,
            "createdAt": format_iso_utc(result.analysis_date),
            "fileName": get_filename_for_data_id(self.db, result.data_id),
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
        """Thin delegator to results.persona_transformers.convert_enhanced_persona_to_frontend_format."""
        return convert_enhanced_persona_to_frontend_format(persona_dict)

    def _map_json_to_persona_schema(self, p_data: Dict[str, Any]):
        """Thin delegator to results.persona_transformers.map_json_to_persona_schema."""
        return map_json_to_persona_schema(p_data)

    def _serialize_field_safely(self, field_data: Any) -> Dict[str, Any]:
        """Thin delegator to results.persona_transformers.serialize_field_safely."""
        return serialize_field_safely(field_data)

    def _store_persona_in_db(self, p_data: Dict[str, Any], result_id: int) -> None:
        """Thin delegator to results.persona_transformers.store_persona_in_db."""
        return store_persona_in_db(self.db, p_data, result_id)

    def filter_design_thinking_persona(
        self, persona_dict: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Thin delegator to results.design_thinking.filter_design_thinking_persona."""
        from backend.services.results.design_thinking import (
            filter_design_thinking_persona as _dt_filter,
        )

        return _dt_filter(persona_dict)

    def get_design_thinking_personas(self, result_id: int) -> List[Dict[str, Any]]:
        """
        Get simplified personas optimized for design thinking display.

        Returns only the 5 essential design thinking fields with quality filtering:
        - name, archetype, demographics, goals_and_motivations,
        - challenges_and_frustrations, key_quotes

        Args:
            result_id: Analysis result ID

        Returns:

            List of filtered persona dictionaries
        """
        from backend.services.results.design_thinking import (
            assemble_design_thinking_personas,
        )

        return assemble_design_thinking_personas(self.get_analysis_result(result_id))
