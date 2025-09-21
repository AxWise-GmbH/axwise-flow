"""
Persona Formation V2  Enhanced fallback builders

Final safety-net strategies to produce minimally valid personas when the primary
pipeline fails or yields no output. Designed to be deterministic and fail-open.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.processing.persona_formation_v2.validation import (
    PersonaValidation,
)


class EnhancedFallbackBuilder:
    """Constructs a minimal, schema-conformant persona from transcript text."""

    def __init__(self) -> None:
        self.validator = PersonaValidation()

    def _collect_quotes(self, transcript: List[Dict[str, Any]]) -> List[str]:
        quotes: List[str] = []
        for seg in transcript:
            try:
                role = (seg.get("role") or "").strip().lower()
                if role in {"interviewer", "moderator", "researcher"}:
                    continue
                txt = seg.get("dialogue") or seg.get("text") or ""
                if txt:
                    quotes.append(str(txt).strip())
            except Exception:
                continue
        # If nothing collected, take anything we have
        if not quotes:
            for seg in transcript:
                txt = seg.get("dialogue") or seg.get("text") or ""
                if txt:
                    quotes.append(str(txt).strip())
        # Deduplicate while preserving order, limit
        seen = set()
        deduped: List[str] = []
        for q in quotes:
            if q not in seen:
                seen.add(q)
                deduped.append(q)
        return deduped[:5]

    def build(
        self, transcript: List[Dict[str, Any]], context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        quotes = self._collect_quotes(transcript)
        # Minimal but schema-conformant persona
        persona: Dict[str, Any] = {
            "name": "Participant",
            "demographics": {
                "value": "Profile: Unknown Participant",
                "evidence": quotes[:1],
            },
            "goals_and_motivations": {
                "value": "Goals inferred from participant statements",
                "evidence": quotes[:2],
            },
            "challenges_and_frustrations": {
                "value": "Challenges inferred from participant statements",
                "evidence": quotes[:2],
            },
            "key_quotes": {
                "value": "",
                "evidence": quotes[:3],
            },
            "_fallback": {
                "strategy": "enhanced_safety_net",
                "document_id": (context or {}).get("document_id") if context else None,
            },
        }
        # Ensure Golden Schema compatibility (non-destructive)
        persona = self.validator.ensure_golden_schema(persona)
        return [persona]
