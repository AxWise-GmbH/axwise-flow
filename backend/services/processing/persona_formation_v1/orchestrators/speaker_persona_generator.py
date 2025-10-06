import logging
from typing import Any, Dict, List, Optional

from backend.utils.pydantic_ai_retry import (
    safe_pydantic_ai_call,
    get_conservative_retry_config,
)
from backend.services.processing.persona_builder import persona_to_dict

logger = logging.getLogger(__name__)


async def generate_single_persona_core(
    svc: Any,
    speaker: str,
    text: str,
    role: str,
    context: Optional[Dict[str, Any]] = None,
    original_dialogues: Optional[List[str]] = None,
    persona_number: int = 0,
) -> Dict[str, Any]:
    """
    Core per-speaker persona generation logic (without semaphore).

    Mirrors the original service implementation to preserve behavior,
    including production/direct/PydanticAI branches, evidence linking V2,
    demographics age fallback, and robust error handling.
    """
    # Prefer production persona if available
    if getattr(svc, "production_persona_available", False) and getattr(
        svc, "production_persona_agent", None
    ):
        logger.info(
            f"[PRODUCTION_PERSONA] Using production persona generation for {speaker} - unified schema approach"
        )
        return await svc._generate_production_persona(speaker, text, role, context)

    # Prefer direct persona if available
    if getattr(svc, "direct_persona_available", False) and getattr(
        svc, "direct_persona_agent", None
    ):
        logger.info(
            f"[DIRECT_PERSONA] Using direct persona generation for {speaker} - no conversion approach"
        )
        return await svc._generate_direct_persona(speaker, text, role, context)

    # Use legacy PydanticAI path if available
    if not (getattr(svc, "pydantic_ai_available", False) and getattr(svc, "persona_agent", None)):
        logger.warning(
            f"[FALLBACK] No PydanticAI agents available for {speaker}, falling back to legacy method"
        )
        return await svc._generate_persona_legacy_fallback(speaker, text, role, context)

    try:
        # Create a context object for this speaker
        speaker_context = {"speaker": speaker, "role": role, **(context or {})}

        # Use full text for analysis
        text_to_analyze = text
        logger.info(f"Using full text of {len(text_to_analyze)} chars for {speaker}")

        # GOLDEN SCHEMA: Simple analysis prompt
        analysis_prompt = f"""
SPEAKER ANALYSIS REQUEST:
Speaker: {speaker}
Role: {role}
Context: {speaker_context.get('industry', 'general')}

TRANSCRIPT CONTENT:
{text_to_analyze}

Please analyze this speaker's content and generate a comprehensive SimplifiedPersonaModel based on the evidence provided. Focus on authentic characteristics, genuine quotes, and realistic behavioral patterns."""

        # Log content size for timeout monitoring
        content_size = len(analysis_prompt)
        if content_size > 30000:
            logger.warning(
                f"[PYDANTIC_AI] Large content detected for {speaker}: {content_size:,} characters "
                f"(May take longer to process, timeout extended to 15min)"
            )

        logger.info(
            f"[PYDANTIC_AI] Calling PydanticAI persona agent for {speaker} ({content_size:,} chars)"
        )

        # Use temperature 0 w/ retry logic
        retry_config = get_conservative_retry_config()
        persona_result = await safe_pydantic_ai_call(
            agent=svc.persona_agent,
            prompt=analysis_prompt,
            context=f"Persona generation for {speaker} (#{persona_number})",
            retry_config=retry_config,
        )

        logger.info(
            f"[PYDANTIC_AI] PydanticAI agent returned response for {speaker} (type: {type(persona_result)})"
        )

        simplified_persona = persona_result
        logger.info(
            f"[PYDANTIC_AI] Extracted simplified persona model for {speaker}: {simplified_persona.name}"
        )

        # Convert SimplifiedPersona -> full dict
        logger.info(
            f"[PERSONA_FORMATION_DEBUG] Converting SimplifiedPersona to full Persona for {speaker}"
        )
        persona_data = svc._convert_simplified_to_full_persona(
            simplified_persona, original_dialogues
        )
        logger.info(
            f"[PYDANTIC_AI] Successfully converted persona model to dictionary for {speaker}"
        )

        # Evidence Linking V2 enrichment (scoped to this speaker)
        try:
            if getattr(svc.evidence_linking_service, "enable_v2", False):
                scope_meta = {"speaker": speaker, "speaker_role": role}
                try:
                    if context and isinstance(context, dict):
                        if context.get("stakeholder_category"):
                            scope_meta["stakeholder_category"] = context["stakeholder_category"]
                        if context.get("document_id"):
                            scope_meta["document_id"] = context["document_id"]
                except Exception:
                    pass
                from backend.services.processing.persona_formation_v1.evidence.linker_adapter import (
                    link_evidence_v2 as _link_v2,
                )

                persona_data, _ = _link_v2(
                    svc.evidence_linking_service,
                    persona_data,
                    scoped_text=text,
                    scope_meta=scope_meta,
                    protect_key_quotes=True,
                )

                # Ensure age is populated if missing (pattern-based fallback)
                try:
                    demo = persona_data.get("demographics") if isinstance(persona_data, dict) else None
                    need_age = True
                    if isinstance(demo, dict):
                        ar = demo.get("age_range")
                        if isinstance(ar, dict) and ar.get("value"):
                            need_age = False
                    if need_age:
                        from backend.services.evidence_intelligence.demographic_intelligence import (
                            DemographicIntelligence,
                        )
                        from backend.services.evidence_intelligence.speaker_intelligence import (
                            SpeakerProfile,
                            SpeakerRole,
                        )
                        di = DemographicIntelligence(llm_service=None)
                        sp = SpeakerProfile(
                            speaker_id=str(speaker),
                            role=SpeakerRole.INTERVIEWEE,
                            unique_identifier=str(speaker),
                        )
                        demographics_data = di._fallback_extraction(text, sp)
                        if demographics_data and (demographics_data.age_range or demographics_data.age):
                            age_value = demographics_data.age_range or (
                                str(demographics_data.age) if demographics_data.age else None
                            )
                            if age_value:
                                demo = dict(demo) if isinstance(demo, dict) else {}
                                existing_evd = []
                                if isinstance(demo.get("age_range"), dict):
                                    existing_evd = demo["age_range"].get("evidence", []) or []
                                demo["age_range"] = {"value": age_value, "evidence": existing_evd}
                                demo["confidence"] = demo.get("confidence", 0.7) or 0.7
                                persona_data["demographics"] = demo
                except Exception as _age_err:
                    logger.debug(f"[DEMOGRAPHICS] Age fallback extraction skipped: {_age_err}")
        except Exception as el_err:
            logger.warning(
                f"[EVIDENCE_LINKING_V2] Skipped during persona build for {speaker}: {el_err}"
            )

        # Debug logs of trait fields
        try:
            logger.info(
                f"[PERSONA_FORMATION_DEBUG] Persona data keys for {speaker}: {list(persona_data.keys())}"
            )
            trait_fields = [
                "demographics",
                "goals_and_motivations",
                "challenges_and_frustrations",
                "needs_and_expectations",
                "decision_making_process",
                "communication_style",
                "technology_usage",
                "pain_points",
                "key_quotes",
            ]
            for field in trait_fields:
                field_value = persona_data.get(field)
                if field_value is None:
                    logger.warning(
                        f"[PERSONA_FORMATION_DEBUG] Field '{field}' is None for {speaker}"
                    )
                elif isinstance(field_value, dict):
                    logger.info(
                        f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker}: {field_value.get('value', 'NO_VALUE')[:100]}..."
                    )
                else:
                    logger.info(
                        f"[PERSONA_FORMATION_DEBUG] Field '{field}' for {speaker} (type {type(field_value)}): {str(field_value)[:100]}..."
                    )
        except Exception:
            pass

        # Ensure persona has a name
        if persona_data and isinstance(persona_data, dict):
            name_override = speaker
            if "name" not in persona_data or not persona_data["name"]:
                persona_data["name"] = name_override

            # Build persona from attributes
            persona = svc.persona_builder.build_persona_from_attributes(
                persona_data, persona_data.get("name", name_override), role
            )
            result = persona_to_dict(persona)
            logger.info(
                f"[PYDANTIC_AI] ✅ Successfully created persona for {speaker}: {persona.name}"
            )
            return result
        else:
            logger.warning(f"[PYDANTIC_AI] No valid persona data for {speaker}")
            raise Exception(f"No valid persona data generated for {speaker}")

    except Exception as e:
        error_message = str(e).lower()
        # Rate limits
        if (
            "rate limit" in error_message
            or "quota" in error_message
            or "429" in error_message
        ):
            logger.error(
                f"[PYDANTIC_AI] ⚠️ RATE LIMIT ERROR for {speaker}: {str(e)} (Consider reducing concurrency from 15)",
                exc_info=True,
            )
        # Timeouts / network
        elif (
            "timeout" in error_message
            or "connection" in error_message
            or "readtimeout" in error_message
        ):
            # Use text length to avoid NameError from missing speaker_content
            content_size = len(text or "")
            logger.error(
                f"[PYDANTIC_AI] ⏱️ TIMEOUT ERROR for {speaker}: {str(e)} (Content size: {content_size:,} chars, Consider chunking large content)",
                exc_info=True,
            )
        # Validation
        elif "pydantic" in error_message or "validation" in error_message:
            logger.error(
                f"[PYDANTIC_AI] 📋 VALIDATION ERROR for {speaker}: {str(e)} (PydanticAI model validation failed)",
                exc_info=True,
            )
        # Malformed function call
        elif (
            "malformed_function_call" in error_message or "finishreason" in error_message
        ):
            logger.error(
                f"[PYDANTIC_AI] 🔧 MALFORMED_FUNCTION_CALL ERROR for {speaker}: {str(e)} (Gemini malformed function call - retry via fallback)",
                exc_info=True,
            )
            try:
                fallback_persona_obj = svc.persona_builder.create_fallback_persona(
                    role if role else "Participant",
                    svc._generate_descriptive_name_from_speaker_id(speaker),
                )
                fallback_persona = persona_to_dict(fallback_persona_obj)
                logger.info(
                    f"[PYDANTIC_AI] Created fallback persona for {speaker} with is_fallback metadata"
                )
                return fallback_persona
            except Exception as fallback_error:
                logger.error(
                    f"[PYDANTIC_AI] Failed to create fallback persona: {fallback_error}"
                )
                raise
        else:
            logger.error(
                f"[PYDANTIC_AI] ❌ GENERAL ERROR for {speaker}: {str(e)}", exc_info=True
            )
        # Re-raise for caller to handle
        raise

