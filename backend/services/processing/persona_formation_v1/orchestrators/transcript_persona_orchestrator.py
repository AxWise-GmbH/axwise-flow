"""Orchestrator for transcript-based parallel persona formation.

Phase 1: Provide a preparation helper that consolidates inputs and concurrency.
Subsequent phases will migrate execution and post-processing.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
import asyncio
import logging
import os
import time

logger = logging.getLogger(__name__)


async def prepare_transcript_parallel_inputs(
    svc: Any,
    transcript: List[Dict[str, Any]],
    participants: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[
    float,
    Dict[str, List[str]],
    Dict[str, str],
    List[Tuple[str, str]],
    asyncio.Semaphore,
]:
    """Consolidate transcript by speaker, map roles, and prepare concurrency control.

    Returns:
        (start_time, speaker_dialogues, speaker_roles_map, sorted_speakers, semaphore)
    """
    logger.info(
        f"[PERSONA_FORMATION_DEBUG] Starting PARALLEL persona formation with {len(transcript)} entries"
    )
    start_time = time.time()

    # Log a sample of the transcript for debugging
    if transcript and len(transcript) > 0:
        logger.info(
            f"[PERSONA_FORMATION_DEBUG] Sample transcript entry: {transcript[0]}"
        )

    # Validate input
    if not transcript or len(transcript) == 0:
        logger.warning(
            "[PERSONA_FORMATION_DEBUG] Empty transcript provided, returning empty list"
        )
        # Signal to caller with empty data; caller should return []
        return (start_time, {}, {}, [], asyncio.Semaphore(1))

    # Consolidate text per speaker and extract roles
    speaker_dialogues: Dict[str, List[str]] = {}
    speaker_roles_map: Dict[str, str] = {}

    # Handle both old and new transcript formats
    for turn in transcript:
        # Extract speaker ID (handle both old and new formats)
        speaker_id = turn.get("speaker_id", turn.get("speaker", "Unknown Speaker"))
        # Extract dialogue/text (handle both old and new formats)
        dialogue = turn.get("dialogue", turn.get("text", ""))
        # Extract role (handle both old and new formats, with fallback to participants if provided)
        role = turn.get("role", "Participant")

        # Initialize speaker entry if not exists
        if speaker_id not in speaker_dialogues:
            speaker_dialogues[speaker_id] = []
            speaker_roles_map[speaker_id] = role  # Store the first inferred role

        # Add this dialogue to the speaker's collection
        speaker_dialogues[speaker_id].append(dialogue)

    # Build grouped text per speaker by document_id and compute doc_spans
    speaker_texts: Dict[str, str] = {}
    speaker_doc_spans_map: Dict[str, List[Dict[str, Any]]] = {}
    try:
        # Prepare buckets preserving per-speaker document order
        buckets_by_speaker: Dict[str, Dict[str, List[str]]] = {}
        order_by_speaker: Dict[str, List[str]] = {}
        for turn in transcript:
            spk = turn.get("speaker_id", turn.get("speaker", "Unknown Speaker"))
            dlg = turn.get("dialogue", turn.get("text", "")) or ""
            did = turn.get("document_id") or "original_text"
            if spk not in buckets_by_speaker:
                buckets_by_speaker[spk] = {}
                order_by_speaker[spk] = []
            if did not in buckets_by_speaker[spk]:
                buckets_by_speaker[spk][did] = []
                order_by_speaker[spk].append(did)
            if dlg:
                buckets_by_speaker[spk][did].append(str(dlg))
        # Assemble texts and spans
        for spk, buckets in buckets_by_speaker.items():
            pieces: List[str] = []
            spans: List[Dict[str, Any]] = []
            cursor = 0
            sep = "\n\n"
            for did in order_by_speaker.get(spk, []):
                block = "\n".join(buckets.get(did) or [])
                start = cursor
                end = start + len(block)
                spans.append({"document_id": did, "start": start, "end": end})
                pieces.append(block)
                cursor = end + len(sep)
            speaker_texts[spk] = sep.join(pieces)
            speaker_doc_spans_map[spk] = spans
    except Exception as _e:
        # Fallback to simple join if anything goes wrong
        speaker_texts = {
            speaker: " ".join(dialogues)
            for speaker, dialogues in speaker_dialogues.items()
        }
        speaker_doc_spans_map = {}

    # Expose doc_spans and scoped_text to downstream via context (mutates by ref)
    try:
        if context is not None and isinstance(context, dict):
            context.setdefault("_doc_spans_map", {}).update(speaker_doc_spans_map)
            context.setdefault("_scoped_text_map", {}).update(speaker_texts)
    except Exception:
        pass

    logger.info(f"Consolidated text for {len(speaker_texts)} speakers")

    # Log the speakers and text lengths for debugging
    for speaker, text in speaker_texts.items():
        logger.info(
            f"Speaker: {speaker}, Role: {speaker_roles_map.get(speaker, 'Unknown')}, Text length: {len(text)} chars"
        )

    # Override with provided participant roles if available
    if participants and isinstance(participants, list):
        for participant in participants:
            if "name" in participant and "role" in participant:
                speaker_name = participant["name"]
                if speaker_name in speaker_roles_map:
                    speaker_roles_map[speaker_name] = participant["role"]
                    logger.info(
                        f"Overriding role for {speaker_name} to {participant['role']}"
                    )
        logger.info(f"Applied {len(participants)} provided participant roles")

    # Process speakers in order of text length (most text first)
    sorted_speakers: List[Tuple[str, str]] = sorted(
        speaker_texts.items(), key=lambda x: len(x[1]), reverse=True
    )

    # Intelligent persona limiting based on content diversity
    MAX_PERSONAS = int(os.getenv("MAX_PERSONAS", "6"))
    if len(sorted_speakers) > MAX_PERSONAS:
        logger.info(
            f"[PERFORMANCE] Applying intelligent persona clustering: {len(sorted_speakers)} speakers → {MAX_PERSONAS} diverse personas"
        )
        # Keep the speakers with most diverse content (by text length and role diversity)
        sorted_speakers = svc._select_diverse_speakers(
            sorted_speakers, speaker_roles_map, MAX_PERSONAS
        )

    # Concurrency
    PAID_TIER_CONCURRENCY = int(os.getenv("PAID_TIER_CONCURRENCY", "12"))
    semaphore = asyncio.Semaphore(PAID_TIER_CONCURRENCY)
    logger.info(
        f"[PERFORMANCE] Created semaphore with max {PAID_TIER_CONCURRENCY} concurrent persona generations (PAID TIER OPTIMIZATION)"
    )

    return (
        start_time,
        speaker_dialogues,
        speaker_roles_map,
        sorted_speakers,
        semaphore,
    )


async def execute_transcript_parallel_generation(
    svc: Any,
    start_time: float,
    speaker_dialogues: Dict[str, List[str]],
    speaker_roles_map: Dict[str, str],
    sorted_speakers: List[Tuple[str, str]],
    semaphore: asyncio.Semaphore,
    context: Optional[Dict[str, Any]] = None,
    event_manager: Any = None,
    EventType: Any = None,
) -> List[Dict[str, Any]]:
    """Execute parallel persona generation and emit progress metrics.

    Mirrors the original service implementation to preserve behavior.
    """
    from backend.services.processing.persona_builder import persona_to_dict

    personas: List[Dict[str, Any]] = []

    # Create tasks for parallel persona generation
    persona_tasks = []
    for i, (speaker, text) in enumerate(sorted_speakers):
        # Get the role for this speaker from our consolidated role mapping
        role = speaker_roles_map.get(speaker, "Participant")

        # PERFORMANCE OPTIMIZATION: Skip interviewer personas
        if role == "Interviewer":
            logger.info(
                f"[PERFORMANCE] Skipping interviewer persona for {speaker} - focusing on interviewees only"
            )
            continue

        # Skip if text is too short (likely noise)
        if len(text) < 100:
            logger.warning(
                f"[PERSONA_FORMATION_DEBUG] Skipping persona generation for {speaker} - text too short ({len(text)} chars)"
            )
            continue

        # Create task for parallel persona generation
        # Pass original dialogues for authentic quote extraction
        original_dialogues = speaker_dialogues.get(speaker, [])
        task = svc._generate_single_persona_with_semaphore(
            speaker, text, role, semaphore, i + 1, context, original_dialogues
        )
        persona_tasks.append((i, speaker, task))

    # Execute all persona generation tasks in parallel with robust error handling
    logger.info(
        f"[PERFORMANCE] Executing {len(persona_tasks)} persona generation tasks in parallel..."
    )

    # Use asyncio.gather with return_exceptions=True to handle individual failures gracefully
    task_results = await asyncio.gather(
        *[task for _, _, task in persona_tasks], return_exceptions=True
    )

    # Process results and handle exceptions
    successful_personas = 0
    failed_personas = 0

    for (i, speaker, _), result in zip(persona_tasks, task_results):
        if isinstance(result, Exception):
            logger.error(
                f"[PERFORMANCE] Persona generation failed for {speaker}: {str(result)}",
                exc_info=True,
            )
            failed_personas += 1

            # Create fallback persona for failed generation
            role = speaker_roles_map.get(speaker, "Participant")
            minimal_persona = svc.persona_builder.create_fallback_persona(role, speaker)
            personas.append(persona_to_dict(minimal_persona))
            logger.info(
                f"[PERFORMANCE] Created fallback persona for failed generation: {speaker}"
            )
        elif result and isinstance(result, dict):
            personas.append(result)
            successful_personas += 1
            logger.info(f"[PERFORMANCE] Successfully processed persona for {speaker}")
        else:
            logger.warning(
                f"[PERFORMANCE] Invalid result for {speaker}, creating fallback"
            )
            failed_personas += 1

            # Create fallback persona for invalid result
            role = speaker_roles_map.get(speaker, "Participant")
            minimal_persona = svc.persona_builder.create_fallback_persona(role, speaker)
            personas.append(persona_to_dict(minimal_persona))

    # Enhanced performance logging with aggressive concurrency metrics
    total_time = time.time() - start_time
    requests_per_minute = (len(sorted_speakers) / total_time) * 60
    sequential_estimate = len(sorted_speakers) * 2.5  # minutes
    performance_improvement = sequential_estimate / max(total_time / 60, 0.1)

    logger.info(
        f"[PYDANTIC_AI] BALANCED PARALLEL persona generation completed in {total_time:.2f} seconds "
        f"({successful_personas} successful, {failed_personas} failed, concurrency=5)"
    )
    logger.info(
        f"[PYDANTIC_AI] Achieved {requests_per_minute:.1f} requests per minute with 5 concurrent PydanticAI agents"
    )
    logger.info(
        f"[PYDANTIC_AI] Performance improvement: ~{performance_improvement:.1f}x faster than sequential "
        f"(estimated {sequential_estimate:.1f} min → {total_time/60:.1f} min)"
    )

    # Rate limit monitoring with PydanticAI
    if failed_personas > 0:
        failure_rate = (failed_personas / len(sorted_speakers)) * 100
        logger.warning(
            f"[PYDANTIC_AI] Failure rate: {failure_rate:.1f}% - Monitor for rate limit issues with PydanticAI agents"
        )
        if failure_rate > 20:
            logger.error(
                f"[PYDANTIC_AI] HIGH FAILURE RATE ({failure_rate:.1f}%) - Consider reducing concurrency"
            )
    else:
        logger.info(
            "[PYDANTIC_AI] ✅ Zero failures - Balanced concurrency with PydanticAI working perfectly!"
        )

    # Emit final progress event
    if event_manager is not None and EventType is not None:
        try:
            await event_manager.emit(
                EventType.PROCESSING_STEP,
                {
                    "stage": "persona_formation_from_transcript",
                    "progress": 1.0,
                    "data": {
                        "personas_found": len(personas),
                        "speakers_processed": len(sorted_speakers),
                        "processing_time_seconds": total_time,
                        "concurrency_level": 15,
                        "requests_per_minute": requests_per_minute,
                        "performance_improvement": f"~{performance_improvement:.1f}x faster",
                        "failure_rate": (
                            (failed_personas / len(sorted_speakers)) * 100
                            if len(sorted_speakers) > 0
                            else 0
                        ),
                        "optimization_type": "AGGRESSIVE_PARALLEL",
                    },
                },
            )
        except Exception as event_error:
            logger.warning(f"Could not emit processing step event: {str(event_error)}")

    logger.info(
        f"[PERSONA_FORMATION_DEBUG] 🎯 FINAL RESULT: Returning {len(personas)} personas from transcript with {len(sorted_speakers)} speakers"
    )

    return personas


async def form_personas_from_transcript_parallel(
    svc: Any,
    transcript: List[Dict[str, Any]],
    participants: Optional[List[Dict[str, Any]]] = None,
    context: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Temporary delegator kept for compatibility during phased extraction."""
    return await svc._form_personas_from_transcript_parallel(
        transcript, participants, context
    )


async def finalize_transcript_personas(
    svc: Any,
    personas: List[Dict[str, Any]],
    sorted_speakers: List[Tuple[str, str]],
) -> List[Dict[str, Any]]:
    """Deduplicate, validate, and enrich personas with stakeholder intelligence.

    Mirrors the original service's post-processing to preserve behavior.
    """
    from backend.utils.content_deduplication import deduplicate_persona_list

    # CONTENT DEDUPLICATION
    logger.info("[PERSONA_FORMATION_DEBUG] 🧹 Deduplicating persona content...")
    deduplicated_personas = deduplicate_persona_list(personas)
    logger.info("[PERSONA_FORMATION_DEBUG] ✅ Content deduplication completed")

    # QUALITY VALIDATION
    try:
        await svc._validate_persona_quality(deduplicated_personas)
    except Exception as validation_error:
        logger.error(
            f"[QUALITY_VALIDATION] Error in transcript persona validation: {str(validation_error)}",
            exc_info=True,
        )
        # Don't fail the entire process due to validation errors

    # STAKEHOLDER INTELLIGENCE
    logger.info(
        "[PERSONA_FORMATION_DEBUG] 🎯 Calculating stakeholder intelligence metrics..."
    )
    for persona in deduplicated_personas:
        try:
            # Calculate influence metrics based on persona characteristics
            influence_metrics = svc._calculate_persona_influence_metrics(persona)

            # Determine a specific stakeholder title/type from persona fields
            specific_type = None
            try:
                role_val = str(persona.get("role", "")).strip()
                if role_val:
                    specific_type = role_val
                else:
                    sd = persona.get("structured_demographics") or {}
                    roles = sd.get("roles") if isinstance(sd, dict) else None
                    roles_val = roles.get("value") if isinstance(roles, dict) else None
                    if isinstance(roles_val, str) and roles_val.strip():
                        specific_type = roles_val.strip()
                # If still not set, try to extract a role phrase from name/archetype/description
                if not specific_type:

                    def _extract_role_phrase(text: str) -> str:
                        if not isinstance(text, str):
                            return ""
                        text = text.strip()
                        if not text:
                            return ""
                        seg = text
                        if "," in text:
                            parts = [p.strip() for p in text.split(",", 1)]
                            seg = parts[1] if len(parts) > 1 else parts[0]
                        if seg.lower().startswith("the "):
                            seg = seg[4:].strip()
                        import re

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
                            "Cafe Owner",
                            "Restaurant Owner",
                            "Freelancer",
                        ]
                        roles_alt = sorted(role_terms, key=len, reverse=True)
                        for term in roles_alt:
                            m = re.search(
                                r"((?:[A-Z][a-z]+\s+){0,3}" + re.escape(term) + r")\b",
                                seg,
                            )
                            if m:
                                return m.group(1).strip()
                        return ""

                    name_text = persona.get("name", "")
                    arc_text = persona.get("archetype", "")
                    desc_text = persona.get("description", "")
                    candidate = (
                        _extract_role_phrase(name_text)
                        or _extract_role_phrase(arc_text)
                        or _extract_role_phrase(desc_text)
                    )
                    if candidate:
                        specific_type = candidate
            except Exception:
                specific_type = None

            # Update the persona's stakeholder intelligence
            if (
                "stakeholder_intelligence" in persona
                and persona["stakeholder_intelligence"]
            ):
                # Always update influence metrics
                persona["stakeholder_intelligence"][
                    "influence_metrics"
                ] = influence_metrics
                # If the current type is generic or missing, and we have a specific title, set it
                try:
                    current_type = str(
                        persona["stakeholder_intelligence"].get("stakeholder_type", "")
                    ).strip()
                    import re

                    if (
                        not current_type
                        or current_type == "primary_customer"
                        or re.match(r"^[A-Z][a-z]+$", current_type)
                    ) and specific_type:
                        persona["stakeholder_intelligence"][
                            "stakeholder_type"
                        ] = specific_type
                except Exception:
                    if specific_type:
                        persona["stakeholder_intelligence"][
                            "stakeholder_type"
                        ] = specific_type
                logger.info(
                    f"[STAKEHOLDER_INTELLIGENCE] Updated metrics/type for {persona.get('name', 'Unknown')}: {influence_metrics} / {persona['stakeholder_intelligence'].get('stakeholder_type')}"
                )
            else:
                # Create stakeholder intelligence if it doesn't exist
                persona["stakeholder_intelligence"] = {
                    "stakeholder_type": specific_type or "primary_customer",
                    "influence_metrics": influence_metrics,
                    "relationships": [],
                    "conflict_indicators": [],
                    "consensus_levels": [],
                }
                logger.info(
                    f"[STAKEHOLDER_INTELLIGENCE] Created stakeholder intelligence for {persona.get('name', 'Unknown')}: {influence_metrics} / {persona['stakeholder_intelligence'].get('stakeholder_type')}"
                )
                # If persona name is generic and we have a specific stakeholder type, set a role-based name
                try:
                    nm = str(persona.get("name", "")).strip()
                    generic_names = {
                        "interviewee",
                        "participant",
                        "user",
                        "customer",
                        "stakeholder",
                        "unknown",
                    }
                    if (
                        nm.lower() in generic_names
                        and specific_type
                        and isinstance(specific_type, str)
                        and specific_type.strip()
                    ):
                        persona["name"] = f"The {specific_type.strip()}"
                except Exception:
                    pass
        except Exception as e:
            logger.error(
                f"[STAKEHOLDER_INTELLIGENCE] Error calculating influence metrics for {persona.get('name', 'Unknown')}: {str(e)}"
            )
            # Keep default values if calculation fails

    # Log summary of generated personas
    if deduplicated_personas:
        persona_names = [p.get("name", "Unknown") for p in deduplicated_personas]
        logger.info(
            f"[PERSONA_FORMATION_DEBUG] Generated persona names: {persona_names}"
        )
    else:
        logger.warning(
            f"[PERSONA_FORMATION_DEBUG] ⚠️ No personas were generated despite having {len(sorted_speakers)} speakers"
        )

    return deduplicated_personas
