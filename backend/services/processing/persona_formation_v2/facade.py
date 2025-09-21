"""
Persona Formation V2 Facade

Orchestrates modular extractors, assembler, and validation behind a feature flag.
This implementation intentionally reuses existing AttributeExtractor and
PersonaBuilder to preserve output shape while enabling EVIDENCE_LINKING_V2.
"""

from typing import List, Dict, Any, Optional
import os

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
from backend.domain.interfaces.llm_unified import ILLMService


class PersonaFormationFacade:
    def __init__(self, llm_service: ILLMService):
        self.llm = llm_service
        self.structuring = TranscriptStructuringService(llm_service)
        self.extractor = AttributeExtractor(llm_service)
        self.assembler = PersonaAssembler()
        self.validator = PersonaValidation()
        self.evidence_linker = EvidenceLinkingService(llm_service)
        self.enable_evidence_v2 = os.getenv("EVIDENCE_LINKING_V2", "false").lower() in (
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

        # Group dialogues by speaker for non-interviewer roles to create per-participant personas
        by_speaker: Dict[str, List[str]] = {}
        for seg in transcript:
            try:
                role = (seg.get("role") or "").strip().lower()
                if role in {"interviewer", "moderator", "researcher"}:
                    continue
                speaker = seg.get("speaker_id") or seg.get("speaker") or "Participant"
                by_speaker.setdefault(speaker, []).append(
                    seg.get("dialogue") or seg.get("text") or ""
                )
            except Exception:
                continue

        personas: List[Dict[str, Any]] = []
        for speaker, utterances in by_speaker.items():
            scoped_text = "\n".join(u for u in utterances if u)
            # Extract attributes for this speaker scope
            scope_meta = {
                "speaker": speaker,
                "speaker_role": "Participant",
                "document_id": (context or {}).get("document_id"),
            }
            attributes = await self.extractor.extract_attributes_from_text(
                scoped_text, role="Participant", scope_meta=scope_meta
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
            persona = self._make_persona_from_attributes(enhanced_attrs)
            # Attach instrumentation for tests/AB only (non-breaking)
            if self.enable_evidence_v2 and evidence_map is not None:
                persona["_evidence_linking_v2"] = {
                    "evidence_map": evidence_map,
                    "metrics": getattr(self.evidence_linker, "last_metrics_v2", {}),
                    "scope_meta": scope_meta,
                }
            # Keep name fallback if missing
            if not persona.get("name"):
                persona["name"] = speaker if isinstance(speaker, str) else "Participant"
            personas.append(persona)

        # If nothing detected (e.g., only interviewer found), create a single persona from all text
        if not personas:
            all_text = "\n".join(
                (seg.get("dialogue") or seg.get("text") or "") for seg in transcript
            )
            attributes = await self.extractor.extract_attributes_from_text(
                all_text, role="Participant"
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
                            all_text,
                            scope_meta=scope_meta,
                            protect_key_quotes=True,
                        )
                    )
                except Exception:
                    enhanced_attrs = attributes
                    evidence_map = None
            persona = self._make_persona_from_attributes(enhanced_attrs)
            if self.enable_evidence_v2 and evidence_map is not None:
                persona["_evidence_linking_v2"] = {
                    "evidence_map": evidence_map,
                    "metrics": getattr(self.evidence_linker, "last_metrics_v2", {}),
                    "scope_meta": scope_meta,
                }
            personas = [persona]

        return personas
