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
        self.enable_trait_formatting = os.getenv(
            "PERSONA_TRAIT_FORMATTING", "true"
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

    async def generate_persona_from_text(
        self, text: Any, context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        # Support both raw text and pre-structured transcripts
        if (
            isinstance(text, list)
            and text
            and isinstance(text[0], dict)
            and "dialogue" in text[0]
        ):
            return await self.form_personas_from_transcript(text, context=context)

        # Otherwise, structure the transcript first
        filename = (
            (context or {}).get("filename") if isinstance(context, dict) else None
        )
        segments = await self.structuring.structure_transcript(
            str(text), filename=filename
        )
        if not segments:
            return []
        return await self.form_personas_from_transcript(segments, context=context)

    async def form_personas_from_transcript(
        self,
        transcript: List[Dict[str, Any]],
        participants: Optional[List[Dict[str, Any]]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        if not transcript:
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

        # Group dialogues by speaker for non-interviewer roles to create per-participant personas
        by_speaker: Dict[str, List[str]] = {}
        role_counts: Dict[str, Dict[str, int]] = {}
        for seg in transcript:
            try:
                role = (seg.get("role") or "").strip().lower()
                speaker = seg.get("speaker_id") or seg.get("speaker") or "Participant"
                # Track role counts per speaker to compute a modal role later
                role_counts.setdefault(speaker, {})[role or "participant"] = (
                    role_counts.setdefault(speaker, {}).get(role or "participant", 0)
                    + 1
                )
                # Exclude interviewer/moderator/researcher turns from persona formation
                if role in {"interviewer", "moderator", "researcher"}:
                    continue
                by_speaker.setdefault(speaker, []).append(
                    seg.get("dialogue") or seg.get("text") or ""
                )
            except Exception:
                continue

        # Compute modal role per speaker to propagate into scope metadata (default Participant)
        modal_role_by_speaker: Dict[str, str] = {}
        for spk, counts in role_counts.items():
            if counts:
                modal = max(counts.items(), key=lambda kv: kv[1])[0]
                # Normalize to title case for downstream display/filters
                modal_role_by_speaker[spk] = (modal or "participant").capitalize()
            else:
                modal_role_by_speaker[spk] = "Participant"

        personas: List[Dict[str, Any]] = []
        for speaker, utterances in by_speaker.items():
            # Build grouped scoped_text per document and corresponding doc_spans for this speaker
            try:
                # Collect (doc_id, text) pairs for this speaker preserving order
                speaker_turns = [
                    (
                        (seg.get("document_id") or "original_text"),
                        (seg.get("dialogue") or seg.get("text") or ""),
                    )
                    for seg in transcript
                    if (seg.get("speaker_id") or seg.get("speaker")) == speaker
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
                if (seg.get("speaker_id") or seg.get("speaker")) == speaker
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

            # LLM-clean: keep only participant-verbatim lines (fail-open)
            try:
                _pre_clean = scoped_text
                scoped_text = await self.evidence_linker.llm_clean_scoped_text(
                    scoped_text,
                    scope_meta={
                        "speaker": speaker,
                        "speaker_role": modal_role_by_speaker.get(
                            speaker, "Participant"
                        ),
                        "document_id": doc_id,
                    },
                )
                # If cleaning changed the text, previously computed doc_spans no longer align; drop them
                if doc_spans and scoped_text != _pre_clean:
                    doc_spans = []
            except Exception:
                pass
            # Extract attributes for this speaker scope
            speaker_role = modal_role_by_speaker.get(speaker, "Participant")
            scope_meta = {
                "speaker": speaker,
                "speaker_role": speaker_role,
                "document_id": doc_id,
            }
            if doc_spans:
                scope_meta["doc_spans"] = doc_spans
            try:
                attributes = await self.extractor.extract_attributes_from_text(
                    scoped_text, role=speaker_role, scope_meta=scope_meta
                )
                enhanced_attrs = attributes
                evidence_map = None
                if self.enable_evidence_v2:
                    try:
                        enhanced_attrs, evidence_map = (
                            self.evidence_linker.link_evidence_to_attributes_v2(
                                attributes,
                                scoped_text,
                                scope_meta=scope_meta,
                                protect_key_quotes=True,
                            )
                        )
                    except Exception:
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
                # Also filter structured evidence_map for instrumentation cleanliness
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
                persona = self._make_persona_from_attributes(enhanced_attrs)

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
                        "scope_meta": scope_meta,
                    }
                # Keep name fallback if missing
                if not persona.get("name"):
                    persona["name"] = (
                        speaker if isinstance(speaker, str) else "Participant"
                    )
                personas.append(persona)
            except Exception as e:
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
                continue

        # If nothing detected (e.g., only interviewer found), create a single persona
        if not personas:
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

        # Optional post-processing: trait formatting (default ON)
        if self.enable_trait_formatting:
            try:
                formatter = TraitFormattingService(self.llm)
                for i, p in enumerate(personas):
                    # Build a minimal attributes dict view for formatting
                    attrs = {k: v for k, v in p.items() if isinstance(v, (str, dict))}
                    formatted_attrs = await formatter.format_trait_values(attrs)
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

        # Persona name normalization and uniqueness (archetypal first name + optional short role)
        try:
            import re

            def _short_role(p: Dict[str, Any]) -> str:
                si = p.get("stakeholder_intelligence") or {}
                role = si.get("stakeholder_type") if isinstance(si, dict) else None
                if not role:
                    role = str(p.get("role") or "").strip()
                if not role:
                    sd = p.get("structured_demographics") or {}
                    if isinstance(sd, dict):
                        r = (
                            (sd.get("roles") or {}).get("value")
                            if sd.get("roles")
                            else None
                        )
                        role = r or role
                return (role or "").strip()[:40]

            def _pick_first_name(nm: str) -> str:
                nm = (nm or "").strip()
                if nm.lower().startswith("the "):
                    nm = ""
                token = nm.split("—")[0].split(",")[0].strip()
                if re.match(r"^[A-Z][a-z]{2,}$", token):
                    return token
                m = re.search(r"\b[A-Z][a-z]{2,}\b", nm)
                if m:
                    return m.group(0)
                return ""

            used: set[str] = set()
            fallback_pool = [
                "Ava",
                "Liam",
                "Mia",
                "Noah",
                "Emma",
                "Ethan",
                "Olivia",
                "Lucas",
                "Sophia",
                "Leo",
            ]
            pool_idx = 0

            for i, p in enumerate(personas):
                base = _pick_first_name(str(p.get("name") or ""))
                role = _short_role(p)
                if not base:
                    # Deterministic fallback from pool
                    while (
                        pool_idx < len(fallback_pool)
                        and fallback_pool[pool_idx] in used
                    ):
                        pool_idx += 1
                    base = fallback_pool[pool_idx % len(fallback_pool)]
                    pool_idx += 1
                composite = f"{base} — {role}" if role else base
                final = composite
                suffix = 2
                while final in used:
                    final = (
                        f"{base} — {role} ({suffix})" if role else f"{base} ({suffix})"
                    )
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
