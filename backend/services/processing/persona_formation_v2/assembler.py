"""
Persona assembler for Persona Formation V2.

Composes extractor outputs and delegates to the legacy PersonaBuilder to
retain exact response shape/back-compat while enabling modular internals.
"""
import logging
from typing import Dict, Any

from backend.services.processing.persona_builder import PersonaBuilder, persona_to_dict

logger = logging.getLogger(__name__)


class PersonaAssembler:
    def __init__(self):
        self._builder = PersonaBuilder()

    def assemble(self, extracted: Dict[str, Dict[str, Any]], base_attributes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge extracted fields into a full attribute dict and build persona using
        PersonaBuilder for maximal backward compatibility.
        """
        attrs = dict(base_attributes or {})
        for k, v in (extracted or {}).items():
            attrs[k] = v

        # Debug logging
        logger.info(f"🔍 [ASSEMBLER] Building persona with attrs keys: {list(attrs.keys())[:15]}...")
        for dk in ['name', 'description', 'archetype', 'goals_and_motivations'][:4]:
            dv = attrs.get(dk)
            if dv:
                preview = str(dv)[:80] if isinstance(dv, str) else str(dv.get('value', ''))[:80] if isinstance(dv, dict) else str(dv)[:80]
                logger.info(f"🔍 [ASSEMBLER] attrs['{dk}']: {preview}...")

        persona = self._builder.build_persona_from_attributes(attrs, role="Participant")

        # Check if we got a fallback persona
        if hasattr(persona, 'evidence') and persona.evidence:
            if "Fallback due to processing error" in persona.evidence:
                logger.warning(f"🚨 [ASSEMBLER] Got fallback persona for {attrs.get('name', 'unknown')}")

        result = persona_to_dict(persona)
        logger.info(f"🔍 [ASSEMBLER] Result persona name: {result.get('name', 'unknown')}, archetype: {result.get('archetype', 'unknown')}")
        return result

