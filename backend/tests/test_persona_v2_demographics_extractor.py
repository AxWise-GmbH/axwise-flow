import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


class DummyLLMService:
    async def generate_response(self, *args, **kwargs):
        raise NotImplementedError


def _build_v2_persona(attributes: dict) -> dict:
    facade = PersonaFormationFacade(DummyLLMService())
    return facade._make_persona_from_attributes(attributes)


def test_demographics_extractor_evidence_trim_and_dedup():
    attributes = {
        "name": "Test",
        "demographics": {
            "value": "  Senior analyst at Acme  ",
            "evidence": [
                "  Based in Berlin  ",
                "Based in Berlin",
                None,
                "",
                "Works in finance",
                "Works in finance",
            ],
        },
        "key_quotes": {"value": "", "evidence": []},
    }
    v2 = _build_v2_persona(attributes)
    demo = v2.get("demographics", {})
    if hasattr(demo, "model_dump"):
        demo = demo.model_dump()

    # Structured keys must exist
    for k in [
        "experience_level",
        "industry",
        "location",
        "professional_context",
        "roles",
        "age_range",
    ]:
        assert k in demo

    # professional_context.value should be a non-empty string (exact content may be enriched by builder)
    pc = demo.get("professional_context", {})
    assert isinstance(pc, dict)
    assert isinstance(pc.get("value", ""), str)
    assert pc.get("value", "") != ""

    # Evidence should be trimmed and de-duplicated by extractor
    ev = pc.get("evidence", [])
    assert isinstance(ev, list)
    quotes = [e.get("quote") if isinstance(e, dict) else e for e in ev]
    # Only one of each, trimmed
    assert "Based in Berlin" in quotes
    assert "Works in finance" in quotes
    assert quotes.count("Based in Berlin") == 1
    assert quotes.count("Works in finance") == 1


def test_demographics_extractor_confidence_default_and_type():
    attributes = {
        "name": "Test",
        "demographics": {
            "value": "Analyst",
            "confidence": "0.85",
            "evidence": ["Analyst"],
        },
        "key_quotes": {"value": "", "evidence": []},
    }
    v2 = _build_v2_persona(attributes)
    demo = v2.get("demographics", {})
    if hasattr(demo, "model_dump"):
        demo = demo.model_dump()
    # Ensure confidence exists and is numeric at top-level structured object
    assert isinstance(demo.get("confidence", 0.0), float)
