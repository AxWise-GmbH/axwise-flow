from fastapi import HTTPException
from sqlalchemy.orm import Session
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional, Literal
from sqlalchemy import desc, asc

import re

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

    # -----------------------------
    # Helper: Filter out Researcher-attributed evidence from SSoT personas
    # -----------------------------
    def _filter_researcher_evidence_for_ssot(
        self,
        personas_ssot: List[Dict[str, Any]],
        transcript: Optional[List[Dict[str, Any]]] = None,
        original_text: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if not personas_ssot:
            return personas_ssot
        try:
            from backend.services.validation.persona_evidence_validator import (
                PersonaEvidenceValidator,
            )

            validator = PersonaEvidenceValidator()

            # Build normalized corpus of Researcher/Interviewer dialogues
            researcher_texts_norm: List[str] = []
            if isinstance(transcript, list):
                for seg in transcript:
                    sp = (seg.get("speaker") or "").strip().lower()
                    if sp in {"researcher", "interviewer", "moderator"}:
                        dialogue = seg.get("dialogue") or seg.get("text") or ""
                        researcher_texts_norm.append(validator._normalize(dialogue))
            elif isinstance(original_text, str) and original_text.strip():
                for line in original_text.splitlines():
                    if re.match(
                        r"^(researcher|interviewer|moderator)\s*:\s*",
                        line.strip(),
                        re.IGNORECASE,
                    ):
                        content = re.sub(
                            r"^(researcher|interviewer|moderator)\s*:\s*",
                            "",
                            line.strip(),
                            flags=re.IGNORECASE,
                        )
                        researcher_texts_norm.append(validator._normalize(content))

            def is_researcher_quote(q: str) -> bool:
                if not q:
                    return False
                qn = validator._normalize(q)
                return any(qn in d for d in researcher_texts_norm)

            cleaned: List[Dict[str, Any]] = []
            fields = [
                "demographics",
                "goals_and_motivations",
                "challenges_and_frustrations",
                "key_quotes",
            ]
            for p in personas_ssot:
                p2 = dict(p) if isinstance(p, dict) else p
                for f in fields:
                    trait = p2.get(f)
                    if isinstance(trait, dict) and "evidence" in trait:
                        ev = trait.get("evidence") or []
                        new_ev = []
                        for item in ev:
                            quote = (
                                item.get("quote")
                                if isinstance(item, dict)
                                else (item if isinstance(item, str) else None)
                            )
                            if quote is None:
                                continue
                            if not is_researcher_quote(quote):
                                new_ev.append(item)
                        trait["evidence"] = new_ev
                cleaned.append(p2)
            return cleaned
        except Exception as e:
            logger.warning(f"Failed to filter researcher evidence: {e}", exc_info=True)
            return personas_ssot

    # -----------------------------
    # Helper: Inject age_range into SSoT personas by parsing source
    # -----------------------------
    def _inject_age_ranges_from_source(
        self,
        personas_ssot: List[Dict[str, Any]],
        transcript: Optional[List[Dict[str, Any]]] = None,
        original_text: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        try:
            # Collect ages from transcript or original text
            ages: List[int] = []

            def extract_ages_from_text(s: str) -> List[int]:
                if not isinstance(s, str):
                    return []
                found: List[int] = []
                for m in re.finditer(
                    r"\b(?:age\s*[:=]\s*(\d{2})|(\d{2})\s*years?\s*old|(\d{2})\s*yo|(?:\(|,)\s*(\d{2})\s*(?:\)|,))\b",
                    s,
                    re.IGNORECASE,
                ):
                    age = next((int(g) for g in m.groups() if g), None)
                    if age and 15 <= age <= 100:
                        found.append(age)
                return found

            if isinstance(transcript, list):
                for seg in transcript:
                    text = (seg.get("dialogue") or seg.get("text") or "").strip()
                    if text:
                        ages.extend(extract_ages_from_text(text))
            if not ages and isinstance(original_text, str):
                ages.extend(extract_ages_from_text(original_text))

            ages = [a for a in ages if 15 <= a <= 100]
            if not ages:
                return personas_ssot

            # Create a concise bucket label
            ages.sort()
            min_age, max_age = ages[0], ages[-1]
            if len(ages) == 1:
                center = ages[0]
                label = f"{max(center-2,15)}–{min(center+2,100)}"
            else:
                if max_age - min_age <= 4:
                    label = f"{min_age}–{max_age}"
                else:
                    mid = ages[len(ages) // 2]
                    low = max(mid - 2, 15)
                    high = min(mid + 2, 100)
                    label = f"{low}–{high}"

            # Inject into each persona demographics.age_range if missing/empty
            for p in personas_ssot:
                if not isinstance(p, dict):
                    continue
                demo = p.get("demographics")
                if not isinstance(demo, dict):
                    continue
                age_field = demo.get("age_range") or {}
                current_val = (
                    age_field.get("value") if isinstance(age_field, dict) else None
                ) or ""
                if str(current_val).strip().lower() in {
                    "",
                    "n/a",
                    "undisclosed",
                    "not specified",
                    "unknown",
                }:
                    if not isinstance(age_field, dict):
                        age_field = {}
                    age_field["value"] = label
                    demo["age_range"] = age_field
            return personas_ssot
        except Exception as e:
            logger.warning(f"Failed to inject age ranges: {e}")
            return personas_ssot

    # -----------------------------
    # Helper: Derive detected stakeholders from personas (fallback)
    # -----------------------------
    def _derive_detected_stakeholders_from_personas(
        self, personas: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        import re

        def slugify(v: str) -> str:
            v = (v or "").lower()
            v = re.sub(r"[^a-z0-9]+", "_", v).strip("_")
            return v[:64] if v else "unknown"

        def to_allowed_type(v: str) -> str:
            v = (v or "").lower()
            if "decision" in v:
                return "decision_maker"
            if "influenc" in v:
                return "influencer"
            if "second" in v or "support" in v:
                return "secondary_user"
            return "primary_customer"

        for i, p in enumerate(personas or []):
            if not isinstance(p, dict):
                continue
            name = p.get("name") or f"Persona_{i+1}"
            mapping = p.get("stakeholder_mapping", {}) or {}
            intel = p.get("stakeholder_intelligence", {}) or {}
            cat = mapping.get("stakeholder_category")
            stype = intel.get("stakeholder_type") or p.get("archetype")

            sid_source = cat or stype or name
            stakeholder_id = slugify(sid_source)
            stakeholder_type = to_allowed_type(stype or cat or "")

            demo_profile = {}
            demo = p.get("demographics")
            if isinstance(demo, dict):
                val = demo.get("value") if isinstance(demo.get("value"), str) else None
                if val:
                    demo_profile["summary"] = val[:200]

            out.append(
                {
                    "stakeholder_id": stakeholder_id,
                    "stakeholder_type": stakeholder_type,
                    "confidence_score": float(p.get("overall_confidence", 0.7)),
                    "demographic_profile": demo_profile,
                    "individual_insights": {},
                    "influence_metrics": intel.get("influence_metrics", {}),
                }
            )
        return out

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

                    # Helper: compute influence metrics when missing or defaults
                    def _compute_influence_metrics_for_persona(
                        persona_dict: Dict[str, Any],
                    ) -> Dict[str, float]:
                        try:
                            # Gather text for simple heuristic analysis (safe, no LLM)
                            name = (persona_dict.get("name") or "").lower()
                            description = (
                                persona_dict.get("description") or ""
                            ).lower()
                            archetype = (persona_dict.get("archetype") or "").lower()
                            demo_val = ""
                            demo = persona_dict.get("demographics")
                            if isinstance(demo, dict):
                                demo_val = (demo.get("value") or "").lower()
                            combined = f"{name} {description} {archetype} {demo_val}"

                            # Defaults
                            decision_power = 0.5
                            technical_influence = 0.5
                            budget_influence = 0.5

                            # Keyword-based adjustments (subset of backend formation logic)
                            decision_markers = [
                                "manager",
                                "director",
                                "ceo",
                                "owner",
                                "executive",
                                "leader",
                                "decision maker",
                                "authority",
                                "supervisor",
                                "head of",
                                "chief",
                            ]
                            tech_markers = [
                                "architect",
                                "engineer",
                                "technical",
                                "it",
                                "developer",
                                "designer",
                                "specialist",
                                "technician",
                            ]
                            budget_markers = [
                                "budget",
                                "purchasing",
                                "procurement",
                                "finance",
                                "cfo",
                                "cost",
                                "spending",
                            ]
                            influencer_markers = ["influencer", "advisor", "consultant"]

                            if any(k in combined for k in decision_markers):
                                decision_power = max(decision_power, 0.85)
                                budget_influence = max(budget_influence, 0.8)
                            if any(k in combined for k in tech_markers):
                                technical_influence = max(technical_influence, 0.85)
                                decision_power = max(decision_power, 0.6)
                            if any(k in combined for k in budget_markers):
                                budget_influence = max(budget_influence, 0.85)
                                decision_power = max(decision_power, 0.7)
                            if any(k in combined for k in influencer_markers):
                                decision_power = max(decision_power, 0.6)

                            # Clamp to [0,1]
                            def clamp(x: float) -> float:
                                try:
                                    return max(0.0, min(1.0, float(x)))
                                except Exception:
                                    return 0.5

                            return {
                                "decision_power": clamp(decision_power),
                                "technical_influence": clamp(technical_influence),
                                "budget_influence": clamp(budget_influence),
                            }
                        except Exception as _:
                            return {
                                "decision_power": 0.5,
                                "technical_influence": 0.5,
                                "budget_influence": 0.5,
                            }

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
                            im = (
                                si.get("influence_metrics")
                                if isinstance(si, dict)
                                else None
                            )
                            needs_compute = True
                            if isinstance(im, dict):
                                try:
                                    dp = float(im.get("decision_power", 0.5))
                                    ti = float(im.get("technical_influence", 0.5))
                                    bi = float(im.get("budget_influence", 0.5))
                                    # If any value is not a number or all equal to 0.5, recompute
                                    if any(
                                        map(
                                            lambda v: not isinstance(v, float),
                                            [dp, ti, bi],
                                        )
                                    ) or (
                                        abs(dp - 0.5) < 1e-6
                                        and abs(ti - 0.5) < 1e-6
                                        and abs(bi - 0.5) < 1e-6
                                    ):
                                        needs_compute = True
                                    else:
                                        needs_compute = False
                                except Exception:
                                    needs_compute = True
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
                                self._store_persona_in_db(p_data, result_id)
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
                    transcript = results_dict.get("transcript")
                    if isinstance(transcript, list) and all(
                        isinstance(x, dict) for x in transcript
                    ):
                        source_payload["transcript"] = transcript
                    else:
                        original_text = results_dict.get(
                            "original_text"
                        ) or results_dict.get("source_text")
                        if isinstance(original_text, str) and original_text.strip():
                            source_payload["original_text"] = original_text
                        elif analysis_result.data_id:
                            source_payload["dataId"] = analysis_result.data_id
                except Exception as e:
                    logger.warning(f"Could not attach source payload: {e}")

                # Evidence attribution filtering: remove Researcher quotes from persona evidence
                try:
                    if personas_ssot:
                        personas_ssot = self._filter_researcher_evidence_for_ssot(
                            personas_ssot,
                            source_payload.get("transcript"),
                            source_payload.get("original_text"),
                        )
                        # Inject missing age ranges from source text/transcript
                        personas_ssot = self._inject_age_ranges_from_source(
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

                # Ensure stakeholder_intelligence.detected_stakeholders is populated
                try:
                    si = formatted_results.get("stakeholder_intelligence")
                    if isinstance(si, dict):
                        detected = si.get("detected_stakeholders")
                        if not detected:
                            derived = self._derive_detected_stakeholders_from_personas(
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
            "key_quotes",  # IMPORTANT: Required by PersonaAPIResponse validation
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

        # Helper to coerce evidence items to list[str]
        def _coerce_evidence(evd: Any) -> List[str]:
            quotes: List[str] = []
            if not evd:
                return quotes
            if isinstance(evd, list):
                for item in evd:
                    if isinstance(item, str):
                        quotes.append(item)
                    elif isinstance(item, dict):
                        q = item.get("quote")
                        if isinstance(q, str) and q:
                            quotes.append(q)
            elif isinstance(evd, dict):
                q = evd.get("quote")
                if isinstance(q, str) and q:
                    quotes.append(q)
            elif isinstance(evd, str):
                quotes.append(evd)
            return quotes

        # Convert trait fields from EnhancedPersonaTrait to simple dict
        for field in trait_fields:
            if field in persona_dict and persona_dict[field] is not None:
                trait = persona_dict[field]
                if isinstance(trait, dict):
                    # Ensure the trait has the expected structure
                    persona_dict[field] = {
                        "value": trait.get("value", ""),
                        "confidence": trait.get("confidence", 0.7),
                        "evidence": _coerce_evidence(trait.get("evidence", [])),
                    }
                else:
                    # Fallback to empty trait structure
                    persona_dict[field] = {
                        "value": "",
                        "confidence": 0.7,
                        "evidence": [],
                    }
            else:
                # Ensure field exists with default structure for legacy consumers
                persona_dict[field] = {"value": "", "confidence": 0.7, "evidence": []}

        # RESTORE key_quotes from preserved metadata if it's missing
        if "key_quotes" not in persona_dict or persona_dict["key_quotes"] is None:
            preserved_key_quotes = persona_dict.get("persona_metadata", {}).get(
                "preserved_key_quotes"
            )
            if preserved_key_quotes:
                persona_dict["key_quotes"] = preserved_key_quotes
                logger.info(
                    f"Restored key_quotes from metadata for persona: {persona_dict.get('name', 'Unknown')}"
                )

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
        from backend.domain.models.persona_schema import (
            AttributedField,
            StructuredDemographics,
        )

        # Convert EnhancedPersona format to frontend-compatible format
        p_data = self._convert_enhanced_persona_to_frontend_format(p_data)

        # Helper function to safely create an AttributedField with proper defaults
        def create_trait(
            trait_data,
            default_value="Unknown",
            default_confidence=0.5,
            default_evidence=None,
        ):
            """Create an AttributedField with proper defaults and type checking, avoiding generic placeholders"""
            if default_evidence is None:
                default_evidence = []

            # Check if we have substantial trait data
            if not isinstance(trait_data, dict):
                # If no trait data, return None instead of generic placeholder
                return None

            # Extract value and evidence
            trait_value = trait_data.get("value")
            trait_evidence = trait_data.get("evidence", [])

            # Quality checks to avoid generic content
            if not trait_value or len(str(trait_value).strip()) < 10:
                # Value is too short or empty
                return None

            # Check for generic placeholder patterns
            generic_patterns = [
                "domain-specific",
                "professional",
                "technology and tools",
                "work environment",
                "collaboration approach",
                "analysis approach",
                "professional challenges",
                "professional responsibilities",
                "tools and methods",
                "professional role",
                "professional growth",
                "efficiency and professional",
                "values data-driven",
                "open to technological",
            ]

            trait_value_lower = str(trait_value).lower()
            if any(pattern in trait_value_lower for pattern in generic_patterns):
                logger.warning(
                    f"Detected generic placeholder pattern in trait value: {trait_value[:50]}..."
                )
                return None

            # Check evidence quality
            if not trait_evidence or len(trait_evidence) == 0:
                # No evidence provided
                return None

            # Filter evidence to ensure it's substantial
            good_evidence = []
            for evidence in trait_evidence:
                if evidence and isinstance(evidence, str) and len(evidence.strip()) > 5:
                    # Avoid generic evidence patterns
                    evidence_lower = evidence.lower()
                    if not any(
                        pattern in evidence_lower
                        for pattern in [
                            "inferred from",
                            "based on statements",
                            "derived from",
                            "extracted from",
                            "representative statements",
                        ]
                    ):
                        good_evidence.append(evidence.strip())

            if len(good_evidence) == 0:
                logger.warning(
                    f"No substantial evidence found for trait: {trait_value[:50]}..."
                )
                return None

            # Create and return the AttributedField only if we have quality content
            logger.info(
                f"Creating quality trait with {len(good_evidence)} evidence items: {trait_value[:50]}..."
            )
            return AttributedField(
                value=str(trait_value),
                evidence=good_evidence[:5],  # Limit to 5 pieces of evidence
            )

        # Helper function to create StructuredDemographics from demographics data
        def create_demographics(demographics_data, default_confidence=0.7):
            """Create StructuredDemographics with proper AttributedField structure and avoid generic placeholders"""
            if not isinstance(demographics_data, dict):
                # Return None instead of creating generic demographics if no data provided
                return None

            # Extract confidence from demographics data
            confidence = demographics_data.get("confidence", default_confidence)

            # Extract value and evidence from demographics data
            demographics_value = demographics_data.get("value", "")
            demographics_evidence = demographics_data.get("evidence", [])

            # Only create StructuredDemographics if we have substantial evidence
            if not demographics_evidence or len(demographics_evidence) < 2:
                logger.warning(
                    f"Insufficient evidence for demographics: {len(demographics_evidence)} items. Skipping generic demographics creation."
                )
                return None

            # Parse demographic information from the value string and evidence
            # Try to extract specific information from evidence rather than using generic placeholders

            def extract_specific_value(evidence_list, keywords, default_value=None):
                """Extract specific values from evidence based on keywords"""
                for evidence in evidence_list:
                    evidence_lower = evidence.lower()
                    for keyword in keywords:
                        if keyword in evidence_lower:
                            # Try to extract the specific value
                            parts = evidence.split(keyword.title())
                            if len(parts) > 1:
                                return evidence  # Use the whole quote as context
                return default_value

            # Distribute evidence intelligently across demographic fields
            experience_keywords = ["years", "experience", "working", "been in"]
            industry_keywords = [
                "company",
                "industry",
                "sector",
                "business",
                "tech",
                "technology",
            ]
            location_keywords = ["based", "located", "city", "area", "live", "office"]
            role_keywords = [
                "role",
                "position",
                "job",
                "title",
                "manager",
                "developer",
                "analyst",
            ]

            # Create fields only if we have specific evidence for them
            fields = {}

            # Experience level - look for experience-related evidence
            exp_evidence = [
                e
                for e in demographics_evidence
                if any(kw in e.lower() for kw in experience_keywords)
            ]
            if exp_evidence:
                fields["experience_level"] = AttributedField(
                    value=f"Experience mentioned in context", evidence=exp_evidence[:2]
                )

            # Industry - look for industry-related evidence
            industry_evidence = [
                e
                for e in demographics_evidence
                if any(kw in e.lower() for kw in industry_keywords)
            ]
            if industry_evidence:
                fields["industry"] = AttributedField(
                    value=f"Industry context from interview",
                    evidence=industry_evidence[:2],
                )

            # Location - look for location-related evidence
            location_evidence = [
                e
                for e in demographics_evidence
                if any(kw in e.lower() for kw in location_keywords)
            ]
            if location_evidence:
                fields["location"] = AttributedField(
                    value=f"Location mentioned in interview",
                    evidence=location_evidence[:2],
                )

            # Roles - look for role-related evidence
            role_evidence = [
                e
                for e in demographics_evidence
                if any(kw in e.lower() for kw in role_keywords)
            ]
            if role_evidence:
                fields["roles"] = AttributedField(
                    value=f"Role context from interview", evidence=role_evidence[:2]
                )

            # Professional context - use the original value if substantial
            if demographics_value and len(demographics_value) > 20:
                fields["professional_context"] = AttributedField(
                    value=demographics_value, evidence=demographics_evidence[:3]
                )

            # Only create StructuredDemographics if we have at least 2 substantial fields
            if len(fields) < 2:
                logger.warning(
                    f"Insufficient demographic fields extracted: {len(fields)}. Skipping demographics creation."
                )
                return None

            # Create StructuredDemographics with only the fields we have good evidence for
            structured_demo = StructuredDemographics(
                experience_level=fields.get("experience_level"),
                industry=fields.get("industry"),
                location=fields.get("location"),
                professional_context=fields.get("professional_context"),
                roles=fields.get("roles"),
                age_range=None,  # Only include if we have specific age evidence
                confidence=confidence,
            )

            logger.info(
                f"Created StructuredDemographics with {len(fields)} fields: {list(fields.keys())}"
            )
            return structured_demo

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
            demographics=create_demographics(demographics_data, confidence),
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

    def _serialize_field_safely(self, field_data: Any) -> Dict[str, Any]:
        """
        Safely serialize a field that might be a Pydantic model or other complex object.

        Args:
            field_data: The field data to serialize

        Returns:
            Dictionary representation suitable for JSON serialization
        """
        if field_data is None:
            return {}

        # Handle StructuredDemographics and other Pydantic models
        if hasattr(field_data, "model_dump"):
            try:
                return field_data.model_dump()
            except Exception as e:
                logger.warning(
                    f"Failed to serialize Pydantic model using model_dump: {e}"
                )

        # Handle regular dictionaries
        if isinstance(field_data, dict):
            return field_data

        # Handle other objects by converting to string
        if hasattr(field_data, "__dict__"):
            try:
                return field_data.__dict__
            except Exception as e:
                logger.warning(f"Failed to serialize object using __dict__: {e}")

        # Fallback: return empty dict for unsupported types
        logger.warning(f"Unsupported field type for serialization: {type(field_data)}")
        return {}

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
                "demographics": json.dumps(
                    self._serialize_field_safely(p_data.get("demographics", {}))
                ),
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

    def filter_design_thinking_persona(
        self, persona_dict: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Filter persona response to only include populated, high-confidence design thinking fields.

        Based on PROJECT_DEEP_DIVE_ANALYSIS.md recommendations:
        - Only return 5 core design thinking fields
        - Filter out empty/low-confidence fields
        - Maintain backward compatibility

        Args:
            persona_dict: Full persona dictionary from database/JSON

        Returns:
            Filtered persona dictionary with only populated design thinking fields
        """
        logger.info(
            f"🔥 FILTERING PERSONA: {persona_dict.get('name', 'Unknown')} - CODE UPDATED!"
        )
        # Core persona identity (always included)
        filtered = {
            "persona_id": persona_dict.get("persona_id"),
            "name": persona_dict.get("name", "Unknown Persona"),
            "description": persona_dict.get("description", ""),
            "archetype": persona_dict.get("archetype", "Professional"),
            "overall_confidence": persona_dict.get(
                "overall_confidence", persona_dict.get("confidence", 0.5)
            ),
            "populated_traits": {},
        }

        # Design thinking core fields (only these 5 fields)
        design_thinking_fields = [
            "demographics",
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]

        # Quality thresholds from analysis document (temporarily lowered for testing)
        CONFIDENCE_THRESHOLD = 0.3  # Further lowered to allow more personas through
        MIN_CONTENT_LENGTH = 5  # Further lowered for debugging

        # Filter and include only high-quality traits
        for field in design_thinking_fields:
            trait = persona_dict.get(field)
            logger.info(
                f"Checking field '{field}': trait type={type(trait)}, value preview={str(trait)[:100] if trait else 'None'}"
            )

            # Handle different persona field structures
            if trait:
                logger.info(f"Field '{field}' trait type string: {str(type(trait))}")
                logger.info(f"Field '{field}' hasattr value: {hasattr(trait, 'value')}")
                logger.info(
                    f"Field '{field}' hasattr confidence: {hasattr(trait, 'confidence')}"
                )
                logger.info(
                    f"Field '{field}' PersonaTrait in type: {'PersonaTrait' in str(type(trait))}"
                )

                # Case 1: PersonaTrait object (from backend.schemas.PersonaTrait)
                if hasattr(trait, "value") and hasattr(trait, "confidence"):
                    value = trait.value if trait.value else ""
                    confidence = trait.confidence if trait.confidence else 0
                    evidence = (
                        trait.evidence
                        if hasattr(trait, "evidence") and trait.evidence
                        else []
                    )
                    logger.info(
                        f"Field '{field}' (PersonaTrait object): value_length={len(value)}, confidence={confidence}"
                    )

                # Case 1b: Check if it's a PersonaTrait by class name (fallback)
                elif "PersonaTrait" in str(type(trait)):
                    logger.info(
                        f"Field '{field}' detected as PersonaTrait by class name, attributes: {dir(trait)}"
                    )
                    try:
                        value = (
                            getattr(trait, "value", "")
                            if hasattr(trait, "value")
                            else ""
                        )
                        confidence = (
                            getattr(trait, "confidence", 0)
                            if hasattr(trait, "confidence")
                            else 0
                        )
                        evidence = (
                            getattr(trait, "evidence", [])
                            if hasattr(trait, "evidence")
                            else []
                        )
                        logger.info(
                            f"Field '{field}' (PersonaTrait by class): value_length={len(value)}, confidence={confidence}"
                        )
                    except Exception as e:
                        logger.error(
                            f"Error extracting PersonaTrait attributes for field '{field}': {e}"
                        )
                        continue

                # Case 2: Trait is a dict with value/confidence structure
                elif isinstance(trait, dict) and "value" in trait:
                    value = trait.get("value", "")
                    confidence = trait.get("confidence", 0)
                    evidence = trait.get("evidence", [])
                    logger.info(
                        f"Field '{field}' (dict structure): value_length={len(value)}, confidence={confidence}"
                    )

                # Case 3: Trait is a simple string (direct value)
                elif isinstance(trait, str):
                    value = trait
                    confidence = 0.8  # Default confidence for string fields
                    evidence = []
                    logger.info(
                        f"Field '{field}' (string structure): value_length={len(value)}, using default confidence={confidence}"
                    )

                # Case 4: Other structures - try to extract value
                else:
                    logger.info(
                        f"Field '{field}' has unexpected structure: {type(trait)}"
                    )
                    continue

                if (
                    value
                    and len(value) >= MIN_CONTENT_LENGTH
                    and confidence >= CONFIDENCE_THRESHOLD
                ):

                    filtered["populated_traits"][field] = {
                        "value": value,
                        "confidence": confidence,
                        "evidence": evidence,
                    }
                    logger.info(f"Added field '{field}' to filtered traits")
                else:
                    logger.info(
                        f"Filtered out field '{field}': value_len={len(value)}, conf={confidence}, thresholds: len>={MIN_CONTENT_LENGTH}, conf>={CONFIDENCE_THRESHOLD}"
                    )
            else:
                logger.info(f"Field '{field}' is None or empty")

        # Add metadata for UI
        filtered["trait_count"] = len(filtered["populated_traits"])
        filtered["evidence_count"] = sum(
            len(trait.get("evidence", []))
            for trait in filtered["populated_traits"].values()
        )

        logger.debug(
            f"Filtered persona '{filtered['name']}': {filtered['trait_count']} traits, {filtered['evidence_count']} evidence items"
        )

        return filtered

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
        try:
            logger.info(f"Getting design thinking personas for result_id: {result_id}")

            # Get full analysis result
            full_result = self.get_analysis_result(result_id)

            if full_result.get("status") != "completed":
                logger.warning(f"Analysis not completed for result_id: {result_id}")
                return []

            # Extract personas from results
            personas = full_result.get("results", {}).get("personas", [])
            logger.info(f"Found {len(personas)} personas in full result")
            logger.info(f"Personas type: {type(personas)}")
            if personas:
                logger.info(f"First persona type: {type(personas[0])}")
                logger.info(
                    f"First persona keys: {list(personas[0].keys()) if isinstance(personas[0], dict) else 'Not a dict'}"
                )

            if not personas:
                logger.info(f"No personas found for result_id: {result_id}")
                return []

            # Filter each persona for design thinking
            filtered_personas = []
            logger.info(f"About to start filtering {len(personas)} personas")
            for i, persona in enumerate(personas):
                logger.info(f"Processing persona {i}: {type(persona)}")

                # Convert persona schema object to dict if needed
                if hasattr(persona, "__dict__"):
                    persona_dict = persona.__dict__
                    logger.info(f"Converted persona {i} from object to dict")
                elif hasattr(persona, "model_dump"):
                    persona_dict = persona.model_dump()
                    logger.info(f"Converted persona {i} using model_dump")
                else:
                    persona_dict = persona
                    logger.info(f"Using persona {i} as-is (already dict)")

                logger.info(
                    f"Persona {i} keys: {list(persona_dict.keys()) if isinstance(persona_dict, dict) else 'Not a dict'}"
                )

                # Apply design thinking filtering
                filtered_persona = self.filter_design_thinking_persona(persona_dict)
                logger.info(
                    f"Filtered persona {i}: trait_count={filtered_persona['trait_count']}"
                )

                # Only include personas with at least one populated trait
                if filtered_persona["trait_count"] > 0:
                    filtered_personas.append(filtered_persona)
                    logger.info(f"Added persona {i} to filtered list")

            logger.info(
                f"Filtered {len(filtered_personas)} design thinking personas from {len(personas)} total"
            )
            return filtered_personas

        except Exception as e:
            logger.error(f"Error getting design thinking personas: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Error retrieving design thinking personas: {str(e)}",
            )
