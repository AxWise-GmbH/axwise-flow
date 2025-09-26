"""
Processing pipeline for interview data analysis.
"""

import logging
import asyncio
import json  # Import json for logging
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


def _convert_enhanced_persona_to_frontend_format(
    persona_dict: Dict[str, Any],
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
                    persona_dict["stakeholder_intelligence"]["influence_metrics"] = {
                        "decision_power": im.get("decision_power", 0.5),
                        "technical_influence": im.get("technical_influence", 0.5),
                        "budget_influence": im.get("budget_influence", 0.5),
                    }

    return persona_dict


async def process_data(
    nlp_processor,
    llm_service,
    data: Any,
    config: Dict[str, Any] = None,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Process uploaded data through NLP pipeline.

    Args:
        nlp_processor: NLP processor instance
        llm_service: LLM service instance
        data: Interview data to process (can be a list, dictionary, or string)
        config: Analysis configuration options
        progress_callback: Optional callback function to report progress
                          Function signature: async def callback(stage: str, progress: float, message: str)

    Returns:
        Dict[str, Any]: Analysis results
    """
    try:
        # Initialize config if not provided
        if config is None:
            config = {}

        # Log processing start
        logger.info(f"Starting data processing pipeline with data type: {type(data)}")
        if config.get("use_enhanced_theme_analysis"):
            logger.info("Using enhanced thematic analysis")

        # Report progress: Starting analysis
        if progress_callback:
            await progress_callback("ANALYSIS", 0.1, "Starting interview data analysis")

        # Process data through NLP pipeline
        # The NLP processor now handles different data formats internally
        logger.info("Calling nlp_processor.process_interview_data...")

        # Extract analysis_id from config if available for quality tracking
        analysis_id = config.get("analysis_id") if config else None

        results = await nlp_processor.process_interview_data(
            data, llm_service, config, progress_callback, analysis_id
        )

        # Progress updates are now handled inside the NLP processor

        # DEBUG LOG: Inspect results immediately after processing
        logger.info("Returned from nlp_processor.process_interview_data.")

        logger.debug(
            f"[process_data] Results after nlp_processor.process_interview_data:"
        )
        try:
            # Attempt to log a pretty-printed version, fallback to raw if error
            logger.debug(json.dumps(results, indent=2, default=str))
        except Exception as log_err:
            logger.debug(f"(Logging error: {log_err}) Raw results: {results}")

        # Validate results
        logger.info("Validating analysis results")
        logger.info("Calling nlp_processor.validate_results...")

        # Progress updates are now handled inside the NLP processor

        # Use the new return type (is_valid, missing_fields)
        is_valid, missing_fields = await nlp_processor.validate_results(results)

        if not is_valid:
            logger.warning(f"Validation issues: {missing_fields}")
            # Continue anyway - we're being more lenient now
            logger.info("Continuing despite validation issues to be more resilient")

        # Progress updates are now handled inside the NLP processor

        # UNIFIED PERSONA ENHANCEMENT - Enhance personas with stakeholder intelligence
        logger.info("Starting persona enhancement with stakeholder intelligence...")
        if progress_callback:
            await progress_callback(
                "PERSONA_FORMATION",
                0.6,
                "Enhancing personas with stakeholder intelligence",
            )

        try:
            # Import services
            from backend.services.persona_enhancement_service import (
                PersonaEnhancementService,
            )

            from backend.utils.persona_utils import normalize_persona_list

            # Initialize services
            persona_enhancement_service = PersonaEnhancementService(llm_service)

            # Normalize personas to handle type compatibility
            if "personas" in results and results["personas"]:
                results["personas"] = normalize_persona_list(results["personas"])

                # Skip old stakeholder analysis - use unified persona enhancement instead
                stakeholder_intelligence = None
                logger.info(
                    "[PERSONA_FORMATION] Skipping separate stakeholder analysis - using unified persona enhancement"
                )

                # Enhance personas with stakeholder intelligence features
                enhancement_result = await persona_enhancement_service.enhance_personas_with_stakeholder_intelligence(
                    personas=results["personas"],
                    stakeholder_intelligence=stakeholder_intelligence,
                    analysis_context={
                        "themes": results.get("themes", []),
                        "patterns": results.get("patterns", []),
                        "insights": results.get("insights", []),
                    },
                )

                # Update results with enhanced personas
                if enhancement_result.enhanced_personas:
                    # Convert enhanced personas to frontend-compatible format
                    enhanced_personas_dict = []
                    for persona in enhancement_result.enhanced_personas:
                        if hasattr(persona, "model_dump"):
                            persona_dict = persona.model_dump()
                            # Convert EnhancedPersonaTrait objects to simple dict format
                            persona_dict = _convert_enhanced_persona_to_frontend_format(
                                persona_dict
                            )
                            enhanced_personas_dict.append(persona_dict)
                        else:
                            enhanced_personas_dict.append(persona)

                    results["personas"] = enhanced_personas_dict
                    logger.info(
                        f"✅ Updated results with {len(results['personas'])} enhanced personas with stakeholder intelligence"
                    )

                    # Log enhancement statistics
                    logger.info(
                        f"[PERSONA_FORMATION] Enhancement complete: "
                        f"{enhancement_result.relationships_created} relationships, "
                        f"{enhancement_result.conflicts_identified} conflicts identified"
                    )

                # FIXED: Preserve stakeholder intelligence for database persistence
                # Create stakeholder intelligence summary from enhanced personas
                if enhancement_result and enhancement_result.enhanced_personas:
                    stakeholder_summary = _create_stakeholder_intelligence_summary(
                        enhancement_result.enhanced_personas
                    )
                    results["stakeholder_intelligence"] = stakeholder_summary
                    logger.info(
                        f"[STAKEHOLDER_DEBUG] ✅ Preserved stakeholder intelligence in results for database persistence"
                    )
                else:
                    logger.info(
                        "✅ Stakeholder intelligence integrated into personas - no separate stakeholder entities"
                    )

            else:
                logger.info("⚠️ No personas found for enhancement")

            logger.info(
                f"Persona enhancement completed. Enhanced personas: {len(results.get('personas', []))}"
            )

        except Exception as e:
            logger.error(f"Error in persona enhancement: {str(e)}")
            # Continue with original personas if enhancement fails
            logger.info("⚠️ Continuing with original personas due to enhancement error")

        # Extract additional insights
        logger.info("Calling nlp_processor.extract_insights...")

        logger.info("Extracting additional insights")

        # Pass the progress_callback to extract_insights
        insights_config = {"progress_callback": progress_callback}

        insights = await nlp_processor.extract_insights(
            results, llm_service, insights_config
        )

        logger.info("Returned from nlp_processor.extract_insights.")

        # Process additional transformations on the results
        # Normalize sentiment values to ensure they're in the -1 to 1 range
        if "themes" in results and isinstance(results["themes"], list):
            for theme in results["themes"]:
                if isinstance(theme, dict) and "sentiment" in theme:
                    # Ensure sentiment is a number between -1 and 1
                    if isinstance(theme["sentiment"], str):
                        try:
                            theme["sentiment"] = float(theme["sentiment"])
                        except ValueError:
                            theme["sentiment"] = 0.0

                    # Normalize the sentiment value
                    if isinstance(theme["sentiment"], (int, float)):
                        # If between 0-1, convert to -1 to 1 range
                        if 0 <= theme["sentiment"] <= 1:
                            theme["sentiment"] = (theme["sentiment"] * 2) - 1
                        # Ensure within -1 to 1 bounds
                        theme["sentiment"] = max(-1.0, min(1.0, theme["sentiment"]))

        if "patterns" in results and isinstance(results["patterns"], list):
            for pattern in results["patterns"]:
                if isinstance(pattern, dict) and "sentiment" in pattern:
                    # Ensure sentiment is a number between -1 and 1
                    if isinstance(pattern["sentiment"], str):
                        try:
                            pattern["sentiment"] = float(pattern["sentiment"])
                        except ValueError:
                            pattern["sentiment"] = 0.0

                    # Normalize the sentiment value
                    if isinstance(pattern["sentiment"], (int, float)):
                        # If between 0-1, convert to -1 to 1 range
                        if 0 <= pattern["sentiment"] <= 1:
                            pattern["sentiment"] = (pattern["sentiment"] * 2) - 1
                        # Ensure within -1 to 1 bounds
                        pattern["sentiment"] = max(-1.0, min(1.0, pattern["sentiment"]))

        logger.info("Data processing pipeline completed successfully")
        logger.info(
            "Starting final result transformations (sentiment normalization)..."
        )

        # Report progress: Completion
        if progress_callback:
            await progress_callback("COMPLETION", 1.0, "Finalizing analysis results")

        # Return the main results dictionary which should contain insights after extract_insights call
        logger.debug(
            f"[process_data] Final results being returned (keys): {list(results.keys())}"
        )  # Log keys before returning
        return results

    except Exception as e:
        logger.error(f"Error in processing pipeline: {str(e)}")
        raise


def _create_stakeholder_intelligence_summary(
    enhanced_personas: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Create stakeholder intelligence summary from enhanced personas for database persistence"""

    detected_stakeholders = []
    processing_metadata = {
        "detection_method": "persona_enhancement",
        "detection_confidence": 0.8,
        "processing_timestamp": str(
            id(enhanced_personas)
        ),  # Simple timestamp alternative
        "llm_analysis_available": True,
        "persona_count": len(enhanced_personas),
    }

    # Extract stakeholder information from enhanced personas
    for persona in enhanced_personas:
        if isinstance(persona, dict):
            # Derive a specific stakeholder_type with robust fallbacks (skip generic placeholders)
            import re

            def _is_generic_type(val: str) -> bool:
                v = (val or "").strip().lower()
                if not v:
                    return True
                generic = {
                    "primary_customer",
                    "customer",
                    "user",
                    "participant",
                    "interviewee",
                    "respondent",
                    "unknown",
                    "n/a",
                    "not specified",
                    "professional role",
                    "professional role context",
                    "professional demographics",
                }
                if v in generic:
                    return True
                if re.match(r"^(primary|generic)\s+(customer|user)s?$", v):
                    return True
                return False

            derived_type = None
            # 1) Prefer explicit type from stakeholder_intelligence if present and specific
            if "stakeholder_intelligence" in persona:
                si = persona["stakeholder_intelligence"]
                if isinstance(si, dict):
                    t = si.get("stakeholder_type")
                    if t and str(t).strip() and not _is_generic_type(str(t)):
                        derived_type = str(t).strip()
            # 2) Next prefer persona_metadata.stakeholder_category if present
            if not derived_type:
                meta = persona.get("persona_metadata") or {}
                if isinstance(meta, dict):
                    cat = meta.get("stakeholder_category")
                    if cat and str(cat).strip() and not _is_generic_type(str(cat)):
                        derived_type = str(cat).strip()
            # 3) Fallback to persona.role if available
            if not derived_type:
                t = persona.get("role")
                if t and str(t).strip() and not _is_generic_type(str(t)):
                    derived_type = str(t).strip()
            # 4) Fallback to structured_demographics.roles.value if available
            if not derived_type:
                sd = persona.get("structured_demographics") or {}
                if isinstance(sd, dict):
                    roles_val = (
                        (sd.get("roles") or {}).get("value")
                        if isinstance(sd.get("roles"), dict)
                        else None
                    )
                    if (
                        roles_val
                        and str(roles_val).strip()
                        and not _is_generic_type(str(roles_val))
                    ):
                        derived_type = str(roles_val).strip()
            # 5) Fallback to demographics.role if available
            if not derived_type:
                demographics = persona.get("demographics") or {}
                if isinstance(demographics, dict):
                    t = demographics.get("role") or demographics.get("job_title")
                    if t and str(t).strip() and not _is_generic_type(str(t)):
                        derived_type = str(t).strip()
                elif (
                    isinstance(demographics, str)
                    and demographics.strip()
                    and not _is_generic_type(demographics)
                ):
                    derived_type = demographics.strip()
            # 6) Attempt to extract a specific role/title from persona name or text (avoid names)
            if not derived_type:
                name_text = str(persona.get("name", "")).strip()
                arc_text = str(persona.get("archetype", "")).strip()
                desc_text = str(persona.get("description", "")).strip()

                role_terms = [
                    "Owner",
                    "Founder",
                    "Marketing Manager",
                    "Manager",
                    "Advisor",
                    "Consultant",
                    "Designer",
                    "Developer",
                    "Engineer",
                    "Director",
                    "Advocate",
                    "Founder & CEO",
                    "Shop Owner",
                    "Boutique Owner",
                    "Café Owner",
                    "Restaurant Owner",
                    "Freelancer",
                ]

                def _extract_role_phrase(text: str) -> str:
                    if not text:
                        return ""
                    # Prefer segment after comma if present (e.g., "Lena, The Agile Marketing Manager")
                    seg = text
                    if "," in text:
                        parts = [p.strip() for p in text.split(",", 1)]
                        seg = parts[1] if len(parts) > 1 else parts[0]
                    # Drop leading "The " if present
                    if seg.lower().startswith("the "):
                        seg = seg[4:].strip()
                    # Try to find a phrase ending with a known role term, including up to 3 preceding words
                    import re

                    roles_alt = sorted(role_terms, key=len, reverse=True)
                    for term in roles_alt:
                        pat = re.compile(
                            r"((?:[A-Z][a-z]+\s+){0,3}" + re.escape(term) + r")\b"
                        )
                        m = pat.search(seg)
                        if m:
                            return m.group(1).strip()
                    return ""

                candidate = (
                    _extract_role_phrase(name_text)
                    or _extract_role_phrase(arc_text)
                    or _extract_role_phrase(desc_text)
                )
                if candidate and not _is_generic_type(candidate):
                    derived_type = candidate

            # 7) Final fallback: keep empty rather than a personal name if still not specific
            if not derived_type:
                derived_type = ""

            stakeholder_info = {
                "stakeholder_id": persona.get("name", "Unknown").replace(" ", "_"),
                "stakeholder_type": derived_type,
                "demographic_info": {},
                "individual_insights": {
                    "goals": persona.get("goals_and_motivations", {}).get("value", ""),
                    "challenges": persona.get("challenges_and_frustrations", {}).get(
                        "value", ""
                    ),
                },
                "influence_metrics": persona.get("stakeholder_intelligence", {}).get(
                    "influence_metrics",
                    {
                        "decision_power": 0.5,
                        "technical_influence": 0.5,
                        "budget_influence": 0.5,
                    },
                ),
                "confidence": persona.get("overall_confidence", 0.7),
                "authentic_evidence": {
                    "quotes_evidence": persona.get("key_quotes", {}).get("evidence", [])
                },
            }

            detected_stakeholders.append(stakeholder_info)

    return {
        "detected_stakeholders": detected_stakeholders,
        "cross_stakeholder_patterns": None,  # Not available from personas
        "multi_stakeholder_summary": None,  # Not available from personas
        "processing_metadata": processing_metadata,
    }
