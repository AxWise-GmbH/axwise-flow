"""
Validation utilities for Persona Formation V2.

Ensures adherence to the Golden Schema:
- AttributedField with value/evidence arrays
- StructuredDemographics without top-level value/evidence
- Presence of the 5 required UI fields
"""
from typing import Dict, Any


class PersonaValidation:
    REQUIRED_FIELDS = [
        "name",
        "demographics",
        "goals_and_motivations",
        "challenges_and_frustrations",
        "key_quotes",
    ]

    def ensure_golden_schema(self, persona: Dict[str, Any]) -> Dict[str, Any]:
        p = dict(persona or {})

        # Ensure required fields exist
        for f in self.REQUIRED_FIELDS:
            if f not in p or p[f] is None:
                if f == "name":
                    p[f] = "Participant"
                else:
                    p[f] = {"value": "", "confidence": 0.7, "evidence": []}

        # Enforce AttributedField shape on traits (value/evidence keys)
        for trait in [
            "goals_and_motivations",
            "challenges_and_frustrations",
            "key_quotes",
        ]:
            v = p.get(trait)
            if isinstance(v, str):
                p[trait] = {"value": v, "confidence": 0.7, "evidence": []}
            elif isinstance(v, dict):
                v.setdefault("value", "")
                v.setdefault("confidence", 0.7)
                v.setdefault("evidence", [])

        # Enforce StructuredDemographics (no top-level value/evidence)
        demo = p.get("demographics")
        if isinstance(demo, dict) and "value" in demo:
            # Convert simple PersonaTrait demographics into structured container
            # Use the proper demographics parser to extract fields
            from backend.services.processing.persona_builder import PersonaBuilder
            from backend.domain.models.persona_schema import PersonaTrait

            try:
                demographics_trait = PersonaTrait(
                    value=demo.get("value", ""),
                    confidence=demo.get("confidence", 0.7),
                    evidence=demo.get("evidence", []),
                )
                builder = PersonaBuilder()
                structured = builder._convert_demographics_to_structured(demographics_trait)
                # Convert to dict format
                p["demographics"] = {
                    "experience_level": {"value": structured.experience_level.value if structured.experience_level else "", "evidence": structured.experience_level.evidence if structured.experience_level else []},
                    "industry": {"value": structured.industry.value if structured.industry else "", "evidence": structured.industry.evidence if structured.industry else []},
                    "location": {"value": structured.location.value if structured.location else "", "evidence": structured.location.evidence if structured.location else []},
                    "professional_context": {"value": structured.professional_context.value if structured.professional_context else "", "evidence": structured.professional_context.evidence if structured.professional_context else []},
                    "roles": {"value": structured.roles.value if structured.roles else "", "evidence": structured.roles.evidence if structured.roles else []},
                    "age_range": {"value": structured.age_range.value if structured.age_range else "", "evidence": structured.age_range.evidence if structured.age_range else []},
                    "confidence": structured.confidence,
                }
            except Exception:
                # Fallback to simple conversion if parsing fails
                p["demographics"] = {
                    "experience_level": {"value": "", "evidence": []},
                    "industry": {"value": "", "evidence": []},
                    "location": {"value": "", "evidence": []},
                    "professional_context": {
                        "value": demo.get("value", ""),
                        "evidence": demo.get("evidence", []),
                    },
                    "roles": {"value": "", "evidence": []},
                    "age_range": {"value": "", "evidence": []},
                    "confidence": float(demo.get("confidence", 0.7) or 0.7),
                }
        elif isinstance(demo, dict) and "confidence" not in demo:
            # Add a confidence for structured demographics
            demo["confidence"] = 0.7

        return p

