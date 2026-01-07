"""
Persona Formation V2 Facade

Orchestrates modular extractors, assembler, and validation behind a feature flag.
This implementation intentionally reuses existing AttributeExtractor and
PersonaBuilder to preserve output shape while enabling EVIDENCE_LINKING_V2.
"""

from typing import List, Dict, Any, Optional
import os
import time

from backend.services.processing.transcript_structuring_service import (
    TranscriptStructuringService,
)
from backend.services.processing.attribute_extractor import AttributeExtractor
from backend.services.processing.persona_builder import persona_to_dict
from backend.services.processing.persona_formation_v2.extractors import (
    DemographicsExtractor,
    GoalsExtractor,
    ChallengesExtractor,
    KeyQuotesExtractor,
)
from backend.services.processing.persona_formation_v2.assembler import PersonaAssembler
from backend.services.processing.persona_formation_v2.validation import (
    PersonaValidation,
)
from backend.services.processing.evidence_linking_service import EvidenceLinkingService
from backend.services.processing.trait_formatting_service import TraitFormattingService
from backend.domain.interfaces.llm_unified import ILLMService
from backend.infrastructure.events.event_manager import event_manager, EventType
from backend.services.processing.persona_formation_v2.fallbacks import (
    EnhancedFallbackBuilder,
)
from backend.services.processing.persona_formation_v2.postprocessing.dedup import (
    PersonaDeduplicator,
)
from backend.services.processing.persona_formation_v2.fast_extraction import (
    fast_extract_personas,
    RAPIDFUZZ_AVAILABLE,
)


class PersonaFormationFacade:
    def __init__(self, llm_service: ILLMService):
        self.llm = llm_service
        self.structuring = TranscriptStructuringService(llm_service)
        self.extractor = AttributeExtractor(llm_service)
        self.assembler = PersonaAssembler()
        self.validator = PersonaValidation()
        self.evidence_linker = EvidenceLinkingService(llm_service)
        # Default ON to align with benchmark behavior (396)
        self.enable_evidence_v2 = os.getenv("EVIDENCE_LINKING_V2", "true").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        self.enable_quality_gate = os.getenv(
            "PERSONA_QUALITY_GATE", "false"
        ).lower() in ("1", "true", "yes", "on")
        self.enable_keyword_highlighting = os.getenv(
            "PERSONA_KEYWORD_HIGHLIGHTING", "true"
        ).lower() in ("1", "true", "yes", "on")
        # Trait formatting disabled by default - causes stalls with many LLM calls
        # Each persona has 15+ traits, each requiring an LLM call
        self.enable_trait_formatting = os.getenv(
            "PERSONA_TRAIT_FORMATTING", "false"
        ).lower() in ("1", "true", "yes", "on")
        self.enable_events = os.getenv("PERSONA_FORMATION_EVENTS", "false").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        self.enable_enhanced_fallback = os.getenv(
            "PERSONA_FALLBACK_ENHANCED", "true"
        ).lower() in ("1", "true", "yes", "on")
        self.enable_dedup = os.getenv("PERSONA_DEDUP", "false").lower() in (
            "1",
            "true",
            "yes",
            "on",
        )
        # Fast extraction: whole-context approach with RapidFuzz evidence mapping
        # DISABLED BY DEFAULT: Fast extraction creates fictional archetype names instead of
        # using actual speaker names from the transcript, which is unacceptable.
        # The standard per-speaker extraction correctly uses speaker names.
        self.enable_fast_extraction = os.getenv(
            "PERSONA_FAST_EXTRACTION", "false"
        ).lower() in ("1", "true", "yes", "on")
        # Extractors (operate on attributes dict)
        self.demographics_ex = DemographicsExtractor()
        self.goals_ex = GoalsExtractor()
        self.challenges_ex = ChallengesExtractor()
        self.quotes_ex = KeyQuotesExtractor()

    def _make_persona_from_attributes(
        self, attributes: Dict[str, Any]
    ) -> Dict[str, Any]:
        # Use modular extractors to pick key fields, then assemble via PersonaBuilder
        extracted = {
            "demographics": self.demographics_ex.from_attributes(attributes),
            "goals_and_motivations": self.goals_ex.from_attributes(attributes),
            "challenges_and_frustrations": self.challenges_ex.from_attributes(
                attributes
            ),
            "key_quotes": self.quotes_ex.from_attributes(attributes),
        }
        persona = self.assembler.assemble(extracted, base_attributes=attributes)
        # Enforce Golden Schema on the result (non-destructive for legacy fields)
        persona = self.validator.ensure_golden_schema(persona)
        return persona

    async def _postprocess_personas(
        self,
        personas: List[Dict[str, Any]],
        transcript: List[Dict[str, Any]],
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Apply post-processing steps to personas (quality gate, formatting, highlighting, dedup, naming).

        This is extracted to allow both standard and fast extraction paths to share post-processing.
        """
        import logging
        import re
        logger = logging.getLogger(__name__)

        # Quality gate (flagged)
        if self.enable_quality_gate:
            try:
                from backend.services.processing.persona_formation_v2.postprocessing.quality import (
                    PersonaQualityGate,
                )
                gate = PersonaQualityGate()
                personas = await gate.improve(personas, context=context)
            except Exception:
                pass

        # Filter out fabricated quotes (those with null start_char/end_char positions)
        # These are LLM-generated quotes that don't exist in the actual transcript
        try:
            def _is_valid_evidence(ev: Any) -> bool:
                """Check if evidence item has valid position data (not fabricated)."""
                if not isinstance(ev, dict):
                    return False
                # Must have non-null start_char and end_char to be considered authentic
                has_positions = (
                    ev.get("start_char") is not None and
                    ev.get("end_char") is not None
                )
                # Must have a quote
                has_quote = bool((ev.get("quote") or "").strip())
                return has_positions and has_quote

            fabricated_count = 0
            for p in personas:
                for field in ["goals_and_motivations", "challenges_and_frustrations", "key_quotes"]:
                    trait = p.get(field)
                    if isinstance(trait, dict) and "evidence" in trait:
                        original_evidence = trait.get("evidence", [])
                        if isinstance(original_evidence, list):
                            valid_evidence = [ev for ev in original_evidence if _is_valid_evidence(ev)]
                            removed = len(original_evidence) - len(valid_evidence)
                            if removed > 0:
                                fabricated_count += removed
                                trait["evidence"] = valid_evidence
                                logger.debug(f"👥 [PERSONA_V2] Removed {removed} fabricated quotes from {p.get('name', 'unknown')}.{field}")

            if fabricated_count > 0:
                logger.info(f"👥 [PERSONA_V2] Filtered out {fabricated_count} fabricated quotes (null positions)")
        except Exception as e:
            logger.warning(f"👥 [PERSONA_V2] Error filtering fabricated quotes: {e}")

        # Trait formatting (default OFF - causes stalls with many LLM calls)
        if self.enable_trait_formatting:
            try:
                import asyncio
                formatter = TraitFormattingService(self.llm)
                for i, p in enumerate(personas):
                    attrs = {k: v for k, v in p.items() if isinstance(v, (str, dict))}
                    try:
                        formatted_attrs = await asyncio.wait_for(
                            formatter.format_trait_values(attrs),
                            timeout=300.0
                        )
                        for k, v in formatted_attrs.items():
                            if isinstance(v, dict) and "value" in v and isinstance(p.get(k), dict):
                                personas[i][k]["value"] = v["value"]
                            elif isinstance(v, str) and isinstance(p.get(k), str):
                                personas[i][k] = v
                    except asyncio.TimeoutError:
                        continue
            except Exception:
                pass

        # Keyword highlighting (default ON)
        if self.enable_keyword_highlighting:
            try:
                from backend.services.processing.persona_formation_v2.postprocessing.keyword_highlighting import (
                    PersonaKeywordHighlighter,
                )
                kh = PersonaKeywordHighlighter()
                personas = await kh.enhance(personas, context=context)
            except Exception:
                pass

        # Deduplication (default OFF)
        if self.enable_dedup:
            try:
                dedup = PersonaDeduplicator()
                personas = dedup.deduplicate(personas)
            except Exception:
                pass

        # Name normalization
        try:
            def _extract_speaker_name(p: Dict[str, Any]) -> str:
                """Extract clean speaker name from persona."""
                # First priority: stored speaker name from transcript
                name = p.get("_speaker_name", "").strip()
                if name:
                    return name
                # Fall back to name field
                name = str(p.get("name") or "").strip()
                if not name:
                    return ""
                # Reject if it looks like role metadata
                if "Role:" in name or "Participation:" in name:
                    return ""
                # Clean up archetype-style names
                if name.lower().startswith("the "):
                    return ""
                # Extract first clean token
                token = name.split("—")[0].split(",")[0].strip()
                if re.match(r"^[A-Z][a-z]{2,}$", token):
                    return token
                m = re.search(r"\b[A-Z][a-z]{2,}\b", name)
                if m:
                    return m.group(0)
                return ""

            used: set[str] = set()
            fallback_counter = 1

            for i, p in enumerate(personas):
                base = _extract_speaker_name(p)
                if not base or base.lower() in {"participant", "interviewee", "unknown", "default"}:
                    base = f"Participant {fallback_counter}"
                    fallback_counter += 1
                # Ensure uniqueness - NO role suffix
                final = base
                suffix = 2
                while final in used:
                    final = f"{base} ({suffix})"
                    suffix += 1
                used.add(final)
                p["name"] = final
        except Exception:
            pass

        return personas

    async def generate_persona_from_text(
        self, text: Any, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        import logging
        logger = logging.getLogger(__name__)

        # Support both raw text and pre-structured transcripts
        if (
            isinstance(text, list)
            and text
            and isinstance(text[0], dict)
            and "dialogue" in text[0]
        ):
            logger.info("👥 [PERSONA_V2] Input is already structured transcript, skipping structuring")
            return await self.form_personas_from_transcript(text, context=context)

        # Otherwise, structure the transcript first
        filename = (
            (context or {}).get("filename") if isinstance(context, dict) else None
        )
        text_str = str(text)
        logger.info(f"👥 [PERSONA_V2] Starting transcript structuring for {len(text_str)} chars...")
        try:
            import asyncio
            # Add a 15-minute timeout for transcript structuring to prevent indefinite hangs
            # Large transcripts (>200K chars) can take 10+ minutes to structure via LLM
            segments = await asyncio.wait_for(
                self.structuring.structure_transcript(text_str, filename=filename),
                timeout=900.0  # 15 minute timeout
            )
            logger.info(f"👥 [PERSONA_V2] Transcript structuring completed: {len(segments) if segments else 0} segments")
            # Debug: Log all unique speakers and roles from structured segments
            if segments:
                speaker_role_counts = {}
                for seg in segments:
                    if isinstance(seg, dict):
                        spk = seg.get("speaker_id", "UNKNOWN")
                        role = seg.get("role", "UNKNOWN")
                        key = f"{spk} ({role})"
                        speaker_role_counts[key] = speaker_role_counts.get(key, 0) + 1
                logger.info(f"👥 [PERSONA_V2] DEBUG - Structured speakers with roles:")
                for spk_role, count in sorted(speaker_role_counts.items(), key=lambda x: -x[1]):
                    logger.info(f"👥 [PERSONA_V2]   - {spk_role}: {count} segments")
        except asyncio.TimeoutError:
            logger.error("👥 [PERSONA_V2] Transcript structuring timed out after 15 minutes!")
            # Return empty list on timeout rather than hanging forever
            return []
        except Exception as e:
            logger.error(f"👥 [PERSONA_V2] Transcript structuring failed: {e}")
            return []

        if not segments:
            logger.warning("👥 [PERSONA_V2] No segments returned from transcript structuring")
            return []
        return await self.form_personas_from_transcript(segments, context=context)

    async def form_personas_from_transcript(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        import logging
        import asyncio
        import re
        logger = logging.getLogger(__name__)

        logger.info(f"👥 [PERSONA_V2] form_personas_from_transcript called with {len(transcript)} segments")

        # DEBUG: Log sample segment structure to diagnose empty dialogue issue
        if transcript:
            sample_seg = transcript[0]
            logger.info(f"👥 [PERSONA_V2] 🔍 DEBUG: Sample segment keys: {list(sample_seg.keys())}")
            logger.info(f"👥 [PERSONA_V2] 🔍 DEBUG: Sample segment dialogue: '{sample_seg.get('dialogue', 'MISSING')[:200] if sample_seg.get('dialogue') else 'EMPTY'}'")
            logger.info(f"👥 [PERSONA_V2] 🔍 DEBUG: Sample segment text: '{sample_seg.get('text', 'MISSING')[:200] if sample_seg.get('text') else 'EMPTY'}'")
            # Count segments with content
            with_dialogue = sum(1 for s in transcript if s.get('dialogue'))
            with_text = sum(1 for s in transcript if s.get('text'))
            logger.info(f"👥 [PERSONA_V2] 🔍 DEBUG: Segments with dialogue: {with_dialogue}, with text: {with_text}")

        if not transcript:
            logger.warning("👥 [PERSONA_V2] Empty transcript received")
            return []

        # Telemetry: start
        start_time = time.perf_counter()
        if self.enable_events:
            try:
                await event_manager.emit(
                    EventType.PROCESSING_STARTED,
                    {
                        "stage": "persona_formation_v2.start",
                        "segments": len(transcript),
                        "document_id": (context or {}).get("document_id"),
                    },
                )
            except Exception:
                pass

        # Fast extraction path: whole-context approach with RapidFuzz evidence mapping
        # Provides ~100x speedup for large transcripts (1000+ segments)
        if self.enable_fast_extraction:
            logger.info(f"👥 [PERSONA_V2] Using FAST extraction (whole-context + RapidFuzz)")
            try:
                fast_personas = await fast_extract_personas(
                    transcript=transcript,
                    llm_service=self.llm,
                    context=context
                )
                if fast_personas:
                    elapsed = time.perf_counter() - start_time
                    logger.info(
                        f"👥 [PERSONA_V2] Fast extraction completed: "
                        f"{len(fast_personas)} personas in {elapsed:.2f}s"
                    )
                    # Apply post-processing (dedup, trait formatting, etc.)
                    return await self._postprocess_personas(fast_personas, transcript, context)
                else:
                    logger.warning("👥 [PERSONA_V2] Fast extraction returned no personas, falling back to standard")
            except Exception as e:
                logger.warning(f"👥 [PERSONA_V2] Fast extraction failed, falling back to standard: {e}")

        # Group dialogues by speaker for non-interviewer roles to create per-participant personas
        by_speaker: Dict[str, List[str]] = {}
        role_counts: Dict[str, Dict[str, int]] = {}
        # Track mapping from actual_speaker (extracted name) to original speaker_ids for matching
        speaker_id_mapping: Dict[str, set] = {}
        for seg in transcript:
            try:
                # Skip non-segment dicts (e.g., metadata appended by analysis_service)
                if not isinstance(seg, dict):
                    continue
                if "metadata" in seg and "dialogue" not in seg and "text" not in seg:
                    logger.debug(f"👥 [PERSONA_V2] Skipping metadata dict: {list(seg.keys())}")
                    continue
                # Skip segments without any content
                dialogue_content = seg.get("dialogue") or seg.get("text") or ""
                if not dialogue_content.strip():
                    continue

                role = (seg.get("role") or "").strip().lower()
                speaker = seg.get("speaker_id") or seg.get("speaker") or "Participant"
                
                # Exclude interviewer/moderator/researcher turns from persona formation
                if role in {"interviewer", "moderator", "researcher"}:
                    continue

                # RESOLUTION LOGIC:
                # Move this UP before role_counts so we track roles against the *resolved* speaker name.
                # Some datasets use room names (e.g. "Schanze", "St. Pauli") as speaker_id.
                # We try to extract the specific subject name from document_id if available.
                # Pattern: "Account Manager Research Session (Name)"
                actual_speaker = speaker
                extracted_role_from_doc = None

                # Strip "I{block_id}|" prefix from speaker if present (e.g., "I1|John Smith" -> "John Smith")
                # This prefix is added for uniqueness during transcript structuring but should not be in final name
                import re
                if isinstance(actual_speaker, str) and re.match(r"^I\d+\|", actual_speaker):
                    actual_speaker = re.sub(r"^I\d+\|", "", actual_speaker)

                doc_id = seg.get("document_id")
                if doc_id and isinstance(doc_id, str):
                    import re
                    # 1. Extract Name: Look for "Session (Name)" pattern
                    m_name = re.search(r"Session\s*\(([^)]+)\)", doc_id)
                    if m_name:
                        extracted_name = m_name.group(1).strip()
                        if extracted_name and len(extracted_name) > 1:
                            if actual_speaker != extracted_name:
                                actual_speaker = extracted_name
                    
                    # 2. Extract Role: Look for words before "Research Session" or "Session"
                    # e.g. "Research Session (Jordan)" -> "Account Manager"
                    m_role = re.search(r"^(.*?)\s+(?:Research\s+)?Session", doc_id)
                    if m_role:
                        candidate_role = m_role.group(1).strip()
                        # specific heuristic: if it looks like a role (not numerical, not empty)
                        if candidate_role and len(candidate_role) > 2 and not candidate_role.isdigit():
                             extracted_role_from_doc = candidate_role

                # Track role counts per speaker to compute a modal role later
                # Use actual_speaker so we track stats against the person, not the room
                role_counts.setdefault(actual_speaker, {})[role or "participant"] = (
                    role_counts.setdefault(actual_speaker, {}).get(role or "participant", 0)
                    + 1
                )
                
                # If we found a specific role in the doc_id, store it to override generic "participant" later
                if extracted_role_from_doc:
                     # We'll use a side-channel dict to store these verified roles
                     if not hasattr(self, "_verified_roles"):
                         self._verified_roles = {}
                     self._verified_roles[actual_speaker] = extracted_role_from_doc

                # logger.info(f"DEBUG: segment speaker={speaker} actual={actual_speaker}")
                by_speaker.setdefault(actual_speaker, []).append(dialogue_content)

                # Track the original speaker_id (stripped of block prefix) AND document_id for this actual_speaker
                # This is needed to match segments when building scoped_text later
                # We need both because the same speaker_id (e.g., "Interviewee") may exist across multiple documents
                stripped_speaker = speaker
                if isinstance(stripped_speaker, str) and re.match(r"^I\d+\|", stripped_speaker):
                    stripped_speaker = re.sub(r"^I\d+\|", "", stripped_speaker)
                segment_doc_id = seg.get("document_id") or "original_text"
                speaker_id_mapping.setdefault(actual_speaker, set()).add((stripped_speaker, segment_doc_id))
            except Exception as e:
                logger.warning(f"👥 [PERSONA_V2] Error processing segment: {e}")
                continue

        # Compute modal role per speaker to propagate into scope metadata (default Participant)
        modal_role_by_speaker: Dict[str, str] = {}
        for spk, counts in role_counts.items():
            # Check for verified role override first
            if hasattr(self, "_verified_roles") and spk in self._verified_roles:
                modal_role_by_speaker[spk] = self._verified_roles[spk]
            elif counts:
                modal = max(counts.items(), key=lambda kv: kv[1])[0]
                # Normalize to title case for downstream display/filters
                modal_role_by_speaker[spk] = (modal or "participant").capitalize()
            else:
                modal_role_by_speaker[spk] = "Participant"

        # Log speaker grouping results for debugging
        logger.info(f"👥 [PERSONA_V2] Speaker grouping complete:")
        logger.info(f"👥 [PERSONA_V2]   - Total speakers with content: {len(by_speaker)}")
        logger.info(f"👥 [PERSONA_V2]   - Speakers: {list(by_speaker.keys())}")
        for spk, dialogues in by_speaker.items():
            total_chars = sum(len(d) for d in dialogues)
            logger.info(f"👥 [PERSONA_V2]   - {spk}: {len(dialogues)} segments, {total_chars} chars, role={modal_role_by_speaker.get(spk, 'Unknown')}")

        if not by_speaker:
            logger.warning(f"👥 [PERSONA_V2] ⚠️ No speakers with content found! Role counts: {role_counts}")

        personas: List[Dict[str, Any]] = []
        # Parallelize the persona generation for each speaker
        process_tasks = []
        # Limit concurrency to avoid hitting LLM rate limits or OOM
        # Set to 10 for parallel speaker processing
        semaphore = asyncio.Semaphore(10)

        # Extract industry from context
        industry_context = context.get("industry", None) if context else None
        logger.info(f"👥 [PERSONA_V2] Using industry context: {industry_context}")

        async def _process_single_speaker(speaker: str, scoped_text: str, doc_spans: List[Dict[str, Any]], scope_meta: Dict[str, Any]):
            async with semaphore:
                try:
                    logger.info(f"👥 [PERSONA_V2] Starting processing for speaker: {speaker}")
                    # DEBUG: Log scoped_text length and sample
                    logger.info(f"👥 [PERSONA_V2] {speaker} scoped_text length: {len(scoped_text)} chars")
                    if len(scoped_text) < 200:
                        logger.warning(f"👥 [PERSONA_V2] ⚠️ {speaker} has VERY SHORT scoped_text: '{scoped_text}'")
                    else:
                        logger.info(f"👥 [PERSONA_V2] {speaker} scoped_text sample (first 300 chars): {scoped_text[:300]}...")
                    
                    # Strict Cleaning: Remove lines that explicitly start with another speaker's name.
                    # This prevents cross-contamination where a segment contains multiple turns or RAG artifacts.
                    def _clean_alien_lines(text, target_speaker):
                        import re
                        lines = text.split('\n')
                        cleaned = []
                        target_lower = target_speaker.lower()
                        # Split target name parts (e.g. "John Smith" -> "john", "goh")
                        target_parts = {p for p in target_lower.split() if len(p) > 2}
                        
                        for line in lines:
                            # Pattern: "Name:" or "A: Name:" or "Q: Name:" - allowing for leading whitespace
                            m = re.match(r"^\s*(?:[AQ]:\s*)?([A-Za-z0-9 _\.]+):\s", line)
                            if m:
                                found_name = m.group(1).lower().strip()
                                
                                # KEEP interviewer lines - they provide context for interviewee responses
                                # Previously: dropping them caused attribute extraction to fail for speakers
                                # whose responses depended on question context
                                # if found_name in {"interviewer", "moderator", "researcher", "question", "key insights", "summary"}:
                                #     continue
                                
                                # Only drop meta/summary lines, keep interviewer questions for context
                                if found_name in {"key insights", "summary"}:
                                    continue
                                
                                # KEEP interviewer lines - they provide essential context for understanding responses
                                if found_name in {"interviewer", "moderator", "researcher", "question"} or found_name.startswith("interviewer"):
                                    cleaned.append(line)
                                    continue
                                    
                                # Check if found_name matches target_speaker
                                is_match = (found_name == target_lower)
                                if not is_match:
                                    # Fuzzy: containment
                                    if found_name in target_lower or target_lower in found_name:
                                        is_match = True
                                    # Fuzzy: significant part overlap
                                    elif any(p in found_name for p in target_parts):
                                        is_match = True
                                
                                if not is_match:
                                    # Line belongs to someone else -> Skip
                                    continue
                            
                            cleaned.append(line)
                        return '\n'.join(cleaned)

                    scoped_text = _clean_alien_lines(scoped_text, speaker)

                    # LLM-clean: keep only participant-verbatim lines (fail-open)
                    try:
                        _pre_clean = scoped_text
                        # Add timeout to prevent indefinite hangs on large transcripts
                        scoped_text_cleaned = await asyncio.wait_for(
                            self.evidence_linker.llm_clean_scoped_text(
                                scoped_text,
                                scope_meta=scope_meta,
                            ),
                            timeout=300.0  # 5 minute timeout for text cleaning
                        )
                        # If cleaning changed the text, previously computed doc_spans no longer align; drop them
                        if doc_spans and scoped_text_cleaned != _pre_clean:
                            doc_spans_task = []
                        else:
                            doc_spans_task = doc_spans
                        scoped_text = scoped_text_cleaned
                    except asyncio.TimeoutError:
                        logger.warning(f"👥 [PERSONA_V2] LLM text cleaning timed out for {speaker}, using original text")
                        doc_spans_task = doc_spans if doc_spans else []
                    except Exception:
                        doc_spans_task = []
                    
                    # Update scope_meta doc_spans if changed
                    scope_meta_task = scope_meta.copy()
                    if doc_spans_task:
                        scope_meta_task["doc_spans"] = doc_spans_task
                    elif "doc_spans" in scope_meta_task:
                         del scope_meta_task["doc_spans"]

                    logger.info(f"👥 [PERSONA_V2] Extracting attributes for {speaker}...")
                    try:
                        attributes = await asyncio.wait_for(
                            self.extractor.extract_attributes_from_text(
                                scoped_text,
                                role=scope_meta["speaker_role"],
                                industry=industry_context,
                                scope_meta=scope_meta_task
                            ),
                            timeout=300.0  # 5 minute timeout for attribute extraction (increased from 3 min)
                        )
                    except asyncio.TimeoutError:
                        logger.error(f"👥 [PERSONA_V2] Attribute extraction TIMED OUT for {speaker} after 300 seconds")
                        return None  # Skip this speaker if extraction times out
                    logger.info(f"👥 [PERSONA_V2] Attributes extracted for {speaker}")
                    enhanced_attrs = attributes
                    evidence_map = None
                    if self.enable_evidence_v2:
                        logger.info(f"👥 [PERSONA_V2] [DEBUG] Starting evidence linking for {speaker}...")
                        try:
                            # link_evidence_to_attributes_v2 is synchronous, wrap with asyncio.to_thread
                            enhanced_attrs, evidence_map = (
                                await asyncio.wait_for(
                                    asyncio.to_thread(
                                        self.evidence_linker.link_evidence_to_attributes_v2,
                                        attributes,
                                        scoped_text,
                                        scope_meta_task,
                                        True,  # protect_key_quotes
                                    ),
                                    timeout=300.0  # 5 minute timeout for evidence linking
                                )
                            )
                            logger.info(f"👥 [PERSONA_V2] [DEBUG] Evidence linking completed for {speaker}")
                        except asyncio.TimeoutError:
                            logger.warning(f"👥 [PERSONA_V2] Evidence linking V2 timed out for {speaker}, using original attributes")
                            enhanced_attrs = attributes
                            evidence_map = None
                        except Exception as e:
                            logger.warning(f"👥 [PERSONA_V2] [DEBUG] Evidence linking exception for {speaker}: {e}")
                            # Fail open: continue without V2 evidence if anything goes wrong
                            enhanced_attrs = attributes
                            evidence_map = None

                    # Persona-level hard gate: drop any question/metadata-like evidence strings
                    def _is_bad_evidence_line(q: str) -> bool:
                        try:
                            import re

                            s = (q or "").strip()
                            if not s:
                                return False
                            # Strip leading timestamps like "[20:04]"
                            s2 = re.sub(r"^\s*(\[[^\]]+\]\s*){1,3}", "", s)
                            ls2 = s2.lower()
                            # Q/Question prefixes
                            if re.match(r"^(q|question)\s*[:\-\u2014\u2013]\s*", ls2):
                                return True
                            # Interviewer/researcher/moderator labels
                            if re.match(r"^(interviewer|researcher|moderator)\s*:\s*", ls2):
                                return True
                            # All-caps labels (e.g., "INTERVIEWER:")
                            if re.match(r"^[A-Z][A-Z ]{1,20}:\s", s2):
                                return True
                            # Section headers and insights
                            if (
                                re.match(r"^(\ud83d\udca1\s*)?key insights?:", ls2)
                                or "key themes identified" in ls2
                            ):
                                return True
                            # Trailing question mark
                            return s2.endswith("?") or s2.endswith("\uff1f")
                        except Exception:
                            return False

                    # Filter evidence arrays in enhanced attributes
                    if self.enable_evidence_v2:
                        logger.info(f"👥 [PERSONA_V2] [DEBUG] Starting evidence filter loop for {speaker}...")
                    import time as _time
                    _field_list = list(enhanced_attrs.items()) if isinstance(enhanced_attrs, dict) else []
                    logger.info(f"👥 [PERSONA_V2] [DEBUG] {speaker} has {len(_field_list)} fields to process: {[fk for fk, _ in _field_list]}")
                    _field_idx = 0
                    if isinstance(enhanced_attrs, dict):
                        # SHORT-CIRCUIT: executed only if v2 is enabled
                        _iter_source = list(enhanced_attrs.items()) if self.enable_evidence_v2 else []
                        for fk, fv in _iter_source:
                            _field_idx += 1
                            if isinstance(fv, dict) and isinstance(
                                fv.get("evidence"), list
                            ):
                                # Helper to extract quote text from evidence item (supports both string and dict)
                                def _get_quote_text(item):
                                    if isinstance(item, dict):
                                        return item.get("quote", "")
                                    elif isinstance(item, str):
                                        return item
                                    return ""
                                
                                pre = [
                                    it
                                    for it in fv["evidence"]
                                    if not _is_bad_evidence_line(_get_quote_text(it))
                                ]
                                # Optional LLM gate over quotes (fail-open)
                                try:
                                    quotes = [_get_quote_text(it) for it in pre]
                                    if quotes:
                                        logger.info(f"👥 [PERSONA_V2] [DEBUG] [{_field_idx}/{len(_field_list)}] Calling llm_filter_quotes for {speaker} field '{fk}' with {len(quotes)} quotes...")
                                        _start = _time.perf_counter()
                                    approved_idx = await asyncio.wait_for(
                                        self.evidence_linker.llm_filter_quotes(
                                            quotes, scope_meta_task
                                        ),
                                        timeout=300.0  # 5 minute timeout for quote filtering
                                    )
                                    if quotes:
                                        _elapsed = _time.perf_counter() - _start
                                        logger.info(f"👥 [PERSONA_V2] [DEBUG] [{_field_idx}/{len(_field_list)}] llm_filter_quotes completed for {speaker} field '{fk}' in {_elapsed:.2f}s")
                                    if approved_idx and len(approved_idx) != len(pre):
                                        pre = [
                                            it for i, it in enumerate(pre) if i in approved_idx
                                        ]
                                except asyncio.TimeoutError:
                                    logger.warning(f"👥 [PERSONA_V2] [DEBUG] [{_field_idx}/{len(_field_list)}] llm_filter_quotes TIMED OUT for {speaker} field '{fk}' after 30s")
                                except Exception as e:
                                    logger.warning(f"👥 [PERSONA_V2] [DEBUG] [{_field_idx}/{len(_field_list)}] llm_filter_quotes EXCEPTION for {speaker} field '{fk}': {e}")
                                if len(pre) != len(fv["evidence"]):
                                    nf = dict(fv)
                                    nf["evidence"] = pre
                                    enhanced_attrs[fk] = nf
                            else:
                                logger.debug(f"👥 [PERSONA_V2] [DEBUG] [{_field_idx}/{len(_field_list)}] Skipping field '{fk}' (no evidence list)")
                    logger.info(f"👥 [PERSONA_V2] [DEBUG] Evidence filter loop completed for {speaker}")

                    # Write structured evidence back into attributes when V2 is enabled
                    if (
                        self.enable_evidence_v2
                        and isinstance(evidence_map, dict)
                        and isinstance(enhanced_attrs, dict)
                    ):
                        for field, items in evidence_map.items():
                            fv = enhanced_attrs.get(field)
                            if isinstance(fv, dict) and isinstance(items, list) and items:
                                nf = dict(fv)
                                nf["evidence"] = (
                                    items  # preserve dict items with offsets/speaker
                                )
                                enhanced_attrs[field] = nf
                    logger.info(f"👥 [PERSONA_V2] Assembling persona for {speaker}...")
                    # Debug: Log enhanced_attrs before building
                    _debug_keys = list(enhanced_attrs.keys()) if enhanced_attrs else []
                    logger.info(f"🔍 [PERSONA_V2_DEBUG] enhanced_attrs keys for {speaker}: {_debug_keys[:15]}...")
                    if enhanced_attrs:
                        for _dk in ['description', 'archetype', 'goals_and_motivations', 'key_quotes'][:4]:
                            _dv = enhanced_attrs.get(_dk)
                            if _dv:
                                _preview = str(_dv)[:100] if isinstance(_dv, str) else str(_dv.get('value', ''))[:100] if isinstance(_dv, dict) else str(_dv)[:100]
                                logger.info(f"🔍 [PERSONA_V2_DEBUG] {speaker}.{_dk}: {_preview}...")
                    try:
                        persona = self._make_persona_from_attributes(enhanced_attrs)
                    except Exception as _build_err:
                        logger.error(f"🚨 [PERSONA_V2_DEBUG] _make_persona_from_attributes failed for {speaker}: {type(_build_err).__name__}: {_build_err}", exc_info=True)
                        raise
                    logger.info(f"👥 [PERSONA_V2] Persona assembled for {speaker}")

                    # Derive a specific role/title for stakeholder detection downstream
                    try:
                        if "role" not in persona or not str(persona.get("role")).strip():
                            # Prefer structured_demographics.roles.value if available
                            sd = persona.get("structured_demographics") or {}
                            roles_val = (
                                (sd.get("roles") or {}).get("value")
                                if isinstance(sd, dict)
                                else None
                            )
                            if (
                                isinstance(roles_val, str)
                                and roles_val.strip()
                                and roles_val.lower()
                                not in {"not specified", "professional role"}
                            ):
                                persona["role"] = roles_val.strip()
                            else:
                                # Fallback: try role_context.value
                                rc = persona.get("role_context")
                                if isinstance(rc, dict) and rc.get("value"):
                                    persona["role"] = str(rc["value"]).strip()[:120]
                                else:
                                    # Last resort: use leading part of name before comma as a title-ish hint
                                    nm = str(persona.get("name") or "").strip()
                                    if "," in nm:
                                        persona["role"] = nm.split(",", 1)[0].strip()
                    except Exception:
                        pass

                    # Final hard gate (post-assembly): remove any evidence items with invalid offsets/speaker
                    try:

                        def _valid_struct_item(it: Any) -> bool:
                            if not isinstance(it, dict):
                                return True  # leave plain strings
                            spk = str((it.get("speaker") or "").strip())
                            if not spk or spk.lower() == "researcher":
                                return False
                            if it.get("start_char") is None or it.get("end_char") is None:
                                return False
                            return True

                        # Clean top-level trait evidence lists
                        for fk, fv in list(persona.items()):
                            if isinstance(fv, dict) and isinstance(
                                fv.get("evidence"), list
                            ):
                                persona[fk]["evidence"] = [
                                    it for it in fv["evidence"] if _valid_struct_item(it)
                                ]
                        # Clean StructuredDemographics nested evidence
                        sd = persona.get("structured_demographics")
                        if isinstance(sd, dict):
                            for dk, dv in list(sd.items()):
                                if isinstance(dv, dict) and isinstance(
                                    dv.get("evidence"), list
                                ):
                                    sd[dk]["evidence"] = [
                                        it
                                        for it in dv["evidence"]
                                        if _valid_struct_item(it)
                                    ]
                        # Clean evidence_map instrumentation too
                        if self.enable_evidence_v2 and isinstance(evidence_map, dict):
                            for field, items in list(evidence_map.items()):
                                evidence_map[field] = [
                                    it for it in (items or []) if _valid_struct_item(it)
                                ]
                    except Exception:
                        pass

                    # Stakeholder type correction: prefer specific titles over generic placeholders
                    try:
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

                        specific_type = None
                        meta = persona.get("persona_metadata") or {}
                        cat = (
                            meta.get("stakeholder_category")
                            if isinstance(meta, dict)
                            else None
                        )
                        if (
                            isinstance(cat, str)
                            and cat.strip()
                            and not _is_generic_type(cat)
                        ):
                            specific_type = cat.strip()
                        else:
                            role_val = str(persona.get("role", "")).strip()
                            if role_val and not _is_generic_type(role_val):
                                specific_type = role_val
                            else:
                                sd = persona.get("structured_demographics") or {}
                                roles_val = (
                                    (sd.get("roles") or {}).get("value")
                                    if isinstance(sd, dict)
                                    else None
                                )
                                if (
                                    isinstance(roles_val, str)
                                    and roles_val.strip()
                                    and not _is_generic_type(roles_val)
                                ):
                                    specific_type = roles_val.strip()
                        if specific_type:
                            si = persona.setdefault("stakeholder_intelligence", {})
                            cur = str(si.get("stakeholder_type", "") or "").strip().lower()
                            if (not cur) or _is_generic_type(cur):
                                si["stakeholder_type"] = specific_type
                    except Exception:
                        pass

                    # Attach instrumentation for tests/AB only (non-breaking)
                    if self.enable_evidence_v2 and evidence_map is not None:
                        persona["_evidence_linking_v2"] = {
                            "evidence_map": evidence_map,
                            "metrics": getattr(self.evidence_linker, "last_metrics_v2", {}),
                            "scope_meta": scope_meta_task,
                        }
                    # ALWAYS use the actual speaker name from the transcript, not LLM-generated fictional names
                    # Preserve any LLM-generated archetype name as a separate field for reference
                    llm_generated_name = persona.get("name", "")
                    if llm_generated_name and llm_generated_name != speaker:
                        persona["generated_archetype_name"] = llm_generated_name

                    # Clean the speaker name: strip "I{block_id}|" prefix if present
                    # This prefix is added for uniqueness during transcript structuring
                    # but should not appear in the final persona name
                    clean_speaker = speaker if isinstance(speaker, str) else "Participant"
                    if isinstance(clean_speaker, str) and re.match(r"^I\d+\|", clean_speaker):
                        # Strip the "I1|", "I2|", etc. prefix
                        clean_speaker = re.sub(r"^I\d+\|", "", clean_speaker)
                        logger.info(f"👥 [PERSONA_V2] Stripped block prefix: '{speaker}' -> '{clean_speaker}'")

                    # Set the cleaned speaker name as the persona name
                    persona["name"] = clean_speaker
                    # Also store the speaker name for downstream reference
                    persona["_speaker_name"] = clean_speaker
                    
                    return persona
                except Exception as e:
                    logger.error(f"👥 [PERSONA_V2] Exception processing speaker {speaker}: {e}", exc_info=True)
                    if self.enable_events:
                        try:
                            await event_manager.emit(
                                EventType.ERROR_OCCURRED,
                                {
                                    "stage": "persona_formation_v2.speaker",
                                    "speaker": str(speaker),
                                    "message": str(e),
                                },
                            )
                            await event_manager.emit_error(
                                e,
                                {
                                    "stage": "persona_formation_v2.speaker",
                                    "speaker": str(speaker),
                                },
                            )
                        except Exception:
                            pass
                    return None

        # Helper to strip "I{block_id}|" prefix from speaker_id for matching
        def _strip_block_prefix(spk: str) -> str:
            if isinstance(spk, str) and re.match(r"^I\d+\|", spk):
                return re.sub(r"^I\d+\|", "", spk)
            return spk

        # Helper to check if a segment matches a speaker's identity
        def _segment_matches_speaker(seg: Dict[str, Any], speaker_tuples: set) -> bool:
            """Check if segment matches any of the (speaker_id, document_id) tuples for this speaker."""
            seg_speaker = _strip_block_prefix(seg.get("speaker_id") or seg.get("speaker") or "")
            seg_doc_id = seg.get("document_id") or "original_text"
            return (seg_speaker, seg_doc_id) in speaker_tuples

        # Prepare tasks for all speakers
        for speaker, utterances in by_speaker.items():
            # Get the set of (original_speaker_id, document_id) tuples that map to this actual_speaker
            # This handles cases where speaker name was extracted from document_id
            # Using tuples prevents cross-contamination when same speaker_id exists across different documents
            original_speaker_tuples = speaker_id_mapping.get(speaker, {(speaker, "original_text")})

            # Build grouped scoped_text per document and corresponding doc_spans for this speaker
            try:
                # Collect (doc_id, text) pairs for this speaker preserving order
                # Match against (speaker_id, document_id) tuples to prevent cross-document contamination
                speaker_turns = [
                    (
                        (seg.get("document_id") or "original_text"),
                        (seg.get("dialogue") or seg.get("text") or ""),
                    )
                    for seg in transcript
                    if _segment_matches_speaker(seg, original_speaker_tuples)
                ]
                order = []
                buckets: Dict[str, List[str]] = {}
                for did, txt in speaker_turns:
                    if did not in buckets:
                        buckets[did] = []
                        order.append(did)
                    if txt:
                        buckets[did].append(str(txt))
                pieces: List[str] = []
                doc_spans: List[Dict[str, Any]] = []  # type: ignore[name-defined]
                cursor = 0
                sep = "\n\n"
                for did in order:
                    block = "\n".join(buckets.get(did) or [])
                    start = cursor
                    end = start + len(block)
                    doc_spans.append({"document_id": did, "start": start, "end": end})
                    pieces.append(block)
                    cursor = end + len(sep)
                scoped_text = sep.join(pieces)
            except Exception:
                scoped_text = "\n".join(u for u in utterances if u)
                doc_spans = []

            # Determine per-speaker document_id from transcript segments (mode)
            doc_ids_for_speaker = [
                (seg.get("document_id") or "").strip()
                for seg in transcript
                if _segment_matches_speaker(seg, original_speaker_tuples)
            ]
            doc_id = None
            if doc_ids_for_speaker:
                # Choose the most frequent non-empty document_id
                from collections import Counter

                counts = Counter([d for d in doc_ids_for_speaker if d])
                if counts:
                    doc_id = counts.most_common(1)[0][0]
            if not doc_id:
                doc_id = (context or {}).get("document_id")
            
            # Prepare scope metadata
            speaker_role = modal_role_by_speaker.get(speaker, "Participant")
            scope_meta = {
                "speaker": speaker,
                "speaker_role": speaker_role,
                "document_id": doc_id,
            }
            if doc_spans:
                scope_meta["doc_spans"] = doc_spans
            
            # Create a task for this speaker
            process_tasks.append(
                _process_single_speaker(speaker, scoped_text, doc_spans, scope_meta)
            )
        
        # Run all speaker tasks in parallel with semaphore
        if process_tasks:
            logger.info(f"👥 [PERSONA_V2] Starting parallel processing of {len(process_tasks)} speakers...")
            import asyncio
            results = await asyncio.gather(*process_tasks, return_exceptions=True)
            # Filter out failed results (None) and log exceptions
            success_count = 0
            failure_count = 0
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"👥 [PERSONA_V2] ❌ Speaker task {i} raised exception: {result}")
                    failure_count += 1
                elif result is None:
                    logger.warning(f"👥 [PERSONA_V2] ⚠️ Speaker task {i} returned None (likely failed)")
                    failure_count += 1
                else:
                    personas.append(result)
                    success_count += 1
            logger.info(f"👥 [PERSONA_V2] Parallel processing complete: {success_count} succeeded, {failure_count} failed")
        else:
            logger.warning(f"👥 [PERSONA_V2] ⚠️ No speaker tasks created - by_speaker was empty!")

        # If nothing detected (e.g., only interviewer found), create a single persona
        if not personas:
            logger.warning(f"👥 [PERSONA_V2] ⚠️ FALLBACK PATH TRIGGERED: No personas were generated from {len(by_speaker)} speakers")
            # Prefer non-interviewer content first; fall back to full transcript if empty
            non_interviewer_text = "\n".join(
                (seg.get("dialogue") or seg.get("text") or "")
                for seg in transcript
                if (seg.get("role") or "").strip().lower()
                not in {"interviewer", "moderator", "researcher"}
            )
            all_text = "\n".join(
                (seg.get("dialogue") or seg.get("text") or "") for seg in transcript
            )
            fallback_text = (
                non_interviewer_text if non_interviewer_text.strip() else all_text
            )
            # LLM-clean fallback scoped text as well (fail-open)
            try:
                fallback_text = await self.evidence_linker.llm_clean_scoped_text(
                    fallback_text,
                    scope_meta={
                        "speaker": "Participant",
                        "speaker_role": "Participant",
                        "document_id": (context or {}).get("document_id"),
                    },
                )
            except Exception:
                pass

            try:
                attributes = await self.extractor.extract_attributes_from_text(
                    fallback_text, role="Participant"
                )
                enhanced_attrs = attributes
                evidence_map = None
                scope_meta = {
                    "speaker": "Participant",
                    "speaker_role": "Participant",
                    "document_id": (context or {}).get("document_id"),
                }
                if self.enable_evidence_v2:
                    try:
                        enhanced_attrs, evidence_map = (
                            self.evidence_linker.link_evidence_to_attributes_v2(
                                attributes,
                                fallback_text,
                                scope_meta=scope_meta,
                                protect_key_quotes=True,
                            )
                        )
                    except Exception:
                        enhanced_attrs = attributes
                        evidence_map = None

                # Persona-level hard gate on fallback path as well
                def _is_bad_evidence_line(q: str) -> bool:
                    try:
                        import re

                        s = (q or "").strip()
                        if not s:
                            return False
                        # Strip leading timestamps like "[20:04]"
                        s2 = re.sub(r"^\s*(\[[^\]]+\]\s*){1,3}", "", s)
                        ls2 = s2.lower()
                        # Q/Question prefixes
                        if re.match(r"^(q|question)\s*[:\-\u2014\u2013]\s*", ls2):
                            return True
                        # Interviewer/researcher/moderator labels
                        if re.match(r"^(interviewer|researcher|moderator)\s*:\s*", ls2):
                            return True
                        # All-caps labels (e.g., "INTERVIEWER:")
                        if re.match(r"^[A-Z][A-Z ]{1,20}:\s", s2):
                            return True
                        # Section headers and insights
                        if (
                            re.match(r"^(\ud83d\udca1\s*)?key insights?:", ls2)
                            or "key themes identified" in ls2
                        ):
                            return True
                        # Trailing question mark
                        return s2.endswith("?") or s2.endswith("\uff1f")
                    except Exception:
                        return False

                if isinstance(enhanced_attrs, dict):
                    for fk, fv in list(enhanced_attrs.items()):
                        if isinstance(fv, dict) and isinstance(
                            fv.get("evidence"), list
                        ):
                            filtered = [
                                q
                                for q in fv["evidence"]
                                if not _is_bad_evidence_line(q)
                            ]
                            # Optional LLM gate (fail-open)
                            try:
                                approved_idx = (
                                    await self.evidence_linker.llm_filter_quotes(
                                        filtered, scope_meta
                                    )
                                )
                                if approved_idx and len(approved_idx) != len(filtered):
                                    filtered = [
                                        q
                                        for i, q in enumerate(filtered)
                                        if i in approved_idx
                                    ]
                            except Exception:
                                pass
                            if len(filtered) != len(fv["evidence"]):
                                nf = dict(fv)
                                nf["evidence"] = filtered
                                enhanced_attrs[fk] = nf
                if isinstance(evidence_map, dict):
                    for field, items in list(evidence_map.items()):
                        # First apply local hygiene
                        pre = [
                            it
                            for it in items
                            if not _is_bad_evidence_line(it.get("quote", ""))
                        ]
                        # Optional LLM gate over quotes (fail-open)
                        try:
                            quotes = [it.get("quote", "") for it in pre]
                            approved_idx = await self.evidence_linker.llm_filter_quotes(
                                quotes, scope_meta
                            )
                            if approved_idx and len(approved_idx) != len(pre):
                                pre = [
                                    it for i, it in enumerate(pre) if i in approved_idx
                                ]
                        except Exception:
                            pass
                        evidence_map[field] = pre
                # Write structured evidence back into attributes when V2 is enabled (fallback path)
                if (
                    self.enable_evidence_v2
                    and isinstance(evidence_map, dict)
                    and isinstance(enhanced_attrs, dict)
                ):
                    for field, items in evidence_map.items():
                        fv = enhanced_attrs.get(field)
                        if isinstance(fv, dict) and isinstance(items, list) and items:
                            nf = dict(fv)
                            nf["evidence"] = items
                            enhanced_attrs[field] = nf
                persona = self._make_persona_from_attributes(enhanced_attrs)

                # Final hard gate (post-assembly) on fallback path: drop invalid evidence items
                try:

                    def _valid_struct_item(it: Any) -> bool:
                        if not isinstance(it, dict):
                            return True
                        spk = str((it.get("speaker") or "").strip())
                        if not spk or spk.lower() == "researcher":
                            return False
                        if it.get("start_char") is None or it.get("end_char") is None:
                            return False
                        return True

                    for fk, fv in list(persona.items()):
                        if isinstance(fv, dict) and isinstance(
                            fv.get("evidence"), list
                        ):
                            persona[fk]["evidence"] = [
                                it for it in fv["evidence"] if _valid_struct_item(it)
                            ]
                    sd = persona.get("structured_demographics")
                    if isinstance(sd, dict):
                        for dk, dv in list(sd.items()):
                            if isinstance(dv, dict) and isinstance(
                                dv.get("evidence"), list
                            ):
                                sd[dk]["evidence"] = [
                                    it
                                    for it in dv["evidence"]
                                    if _valid_struct_item(it)
                                ]
                    if self.enable_evidence_v2 and isinstance(evidence_map, dict):
                        for field, items in list(evidence_map.items()):
                            evidence_map[field] = [
                                it for it in (items or []) if _valid_struct_item(it)
                            ]
                except Exception:
                    pass

                # Stakeholder type correction on fallback path as well (skip generic placeholders)
                try:
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

                    specific_type = None
                    meta = persona.get("persona_metadata") or {}
                    cat = (
                        meta.get("stakeholder_category")
                        if isinstance(meta, dict)
                        else None
                    )
                    if (
                        isinstance(cat, str)
                        and cat.strip()
                        and not _is_generic_type(cat)
                    ):
                        specific_type = cat.strip()
                    else:
                        role_val = str(persona.get("role", "")).strip()
                        if role_val and not _is_generic_type(role_val):
                            specific_type = role_val
                        else:
                            sd = persona.get("structured_demographics") or {}
                            roles_val = (
                                (sd.get("roles") or {}).get("value")
                                if isinstance(sd, dict)
                                else None
                            )
                            if (
                                isinstance(roles_val, str)
                                and roles_val.strip()
                                and not _is_generic_type(roles_val)
                            ):
                                specific_type = roles_val.strip()
                    if specific_type:
                        si = persona.setdefault("stakeholder_intelligence", {})
                        cur = str(si.get("stakeholder_type", "") or "").strip().lower()
                        if (not cur) or _is_generic_type(cur):
                            si["stakeholder_type"] = specific_type
                except Exception:
                    pass

                if self.enable_evidence_v2 and evidence_map is not None:
                    persona["_evidence_linking_v2"] = {
                        "evidence_map": evidence_map,
                        "metrics": getattr(self.evidence_linker, "last_metrics_v2", {}),
                        "scope_meta": scope_meta,
                    }
                personas = [persona]
            except Exception as e:
                if self.enable_events:
                    try:
                        await event_manager.emit(
                            EventType.ERROR_OCCURRED,
                            {
                                "stage": "persona_formation_v2.fallback",
                                "message": str(e),
                            },
                        )
                        await event_manager.emit_error(
                            e, {"stage": "persona_formation_v2.fallback"}
                        )
                    except Exception:
                        pass
                if self.enable_enhanced_fallback:
                    builder = EnhancedFallbackBuilder()
                    personas = builder.build(transcript, context=context)
                else:
                    personas = []

        # Optional post-processing: quality gate (flagged)
        if self.enable_quality_gate:
            try:
                from backend.services.processing.persona_formation_v2.postprocessing.quality import (
                    PersonaQualityGate,
                )

                gate = PersonaQualityGate()
                personas = await gate.improve(personas, context=context)
            except Exception:
                # Fail-open on any quality gate issue
                pass

        # Optional post-processing: trait formatting (default OFF - causes stalls with many LLM calls)
        # Each persona has 15+ traits, each requiring an LLM call = 45+ calls for 3 personas
        if self.enable_trait_formatting:
            try:
                import asyncio
                formatter = TraitFormattingService(self.llm)
                for i, p in enumerate(personas):
                    # Build a minimal attributes dict view for formatting
                    attrs = {k: v for k, v in p.items() if isinstance(v, (str, dict))}
                    try:
                        # Add 60s timeout per persona to prevent stalls
                        formatted_attrs = await asyncio.wait_for(
                            formatter.format_trait_values(attrs),
                            timeout=300.0
                        )
                        # Apply formatted 'value' back into persona where applicable
                        for k, v in formatted_attrs.items():
                            if (
                                isinstance(v, dict)
                                and "value" in v
                                and isinstance(p.get(k), dict)
                            ):
                                personas[i][k]["value"] = v["value"]
                            elif isinstance(v, str) and isinstance(p.get(k), str):
                                personas[i][k] = v
                    except asyncio.TimeoutError:
                        logger.warning(f"👥 [PERSONA_V2] Trait formatting timed out for persona {i}, skipping")
                        continue
            except Exception:
                # Fail-open on formatting issues
                pass

        # Optional post-processing: keyword highlighting (default ON)
        if self.enable_keyword_highlighting:
            try:
                from backend.services.processing.persona_formation_v2.postprocessing.keyword_highlighting import (
                    PersonaKeywordHighlighter,
                )

                kh = PersonaKeywordHighlighter()
                personas = await kh.enhance(personas, context=context)
            except Exception:
                # Fail-open on highlighting issues
                pass

        # Optional post-processing: deduplication (default OFF)
        if self.enable_dedup:
            try:
                dedup = PersonaDeduplicator()
                personas = dedup.deduplicate(personas)
            except Exception:
                # Fail-open on dedup issues
                pass

        # Persona name normalization and uniqueness
        # Use actual speaker names from transcript, with role suffix for disambiguation
        try:
            import re

            # Track used names for uniqueness
            used: set[str] = set()
            # Fallback counter for unnamed participants
            fallback_counter = 1

            for i, p in enumerate(personas):
                # PRIORITY: Use the actual speaker name from transcript (stored in _speaker_name)
                # This is the ground truth from the interview data
                speaker_name = p.get("_speaker_name", "").strip()

                # If no speaker name stored, fall back to current name field
                if not speaker_name:
                    speaker_name = str(p.get("name") or "").strip()
                    # Clean up any archetype-style names (e.g., "Elena, The Data Strategist" -> "Elena")
                    if speaker_name:
                        # Extract first name-like token (before any " — " or ",")
                        token = speaker_name.split("—")[0].split(",")[0].strip()
                        if re.match(r"^[A-Z][a-z]{2,}$", token):
                            speaker_name = token
                        elif speaker_name.lower().startswith("the "):
                            speaker_name = ""  # Generic archetype, need fallback
                        # Reject any name that looks like role metadata
                        elif "Role:" in speaker_name or "Participation:" in speaker_name:
                            speaker_name = ""

                # Use speaker name directly - NO role suffix appended
                # The name should be just the speaker's name from the transcript
                base = speaker_name
                if not base or base.lower() in {"participant", "interviewee", "unknown", "default"}:
                    # Use numbered fallback for truly unknown speakers
                    base = f"Participant {fallback_counter}"
                    fallback_counter += 1

                # Ensure uniqueness with simple numeric suffix if needed
                final = base
                suffix = 2
                while final in used:
                    final = f"{base} ({suffix})"
                    suffix += 1
                used.add(final)
                p["name"] = final
        except Exception:
            pass

        # Telemetry: completed
        if self.enable_events:
            try:
                duration_ms = int((time.perf_counter() - start_time) * 1000)
                await event_manager.emit(
                    EventType.PROCESSING_COMPLETED,
                    {
                        "stage": "persona_formation_v2.end",
                        "persona_count": len(personas),
                        "duration_ms": duration_ms,
                    },
                )
            except Exception:
                pass
        return personas
