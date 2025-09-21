import pytest

from backend.services.processing.persona_builder import PersonaBuilder, persona_to_dict
from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


class DummyLLMService:
    async def generate_response(self, *args, **kwargs):
        raise NotImplementedError


def _build_v1_persona(attributes: dict) -> dict:
    builder = PersonaBuilder()
    persona = builder.build_persona_from_attributes(attributes, role="Participant")
    return persona_to_dict(persona)


def _build_v2_persona(attributes: dict) -> dict:
    facade = PersonaFormationFacade(DummyLLMService())
    # Intentionally call the internal helper to avoid any LLM work
    return facade._make_persona_from_attributes(attributes)


def test_key_quotes_parity_simple():
    attributes = {
        "name": "Alice",
        "demographics": {
            "value": "Senior data analyst in retail",
            "confidence": 0.8,
            "evidence": [
                "I manage sales dashboards for the retail division",
            ],
        },
        "goals_and_motivations": {"value": "Improve reporting", "evidence": []},
        "challenges_and_frustrations": {"value": "Data silos", "evidence": []},
        "key_quotes": {
            "value": "Dashboards save me hours each week",
            "confidence": 0.9,
            "evidence": [
                "Dashboards save me hours each week",
                "I rely on the dashboard to summarize KPIs",
            ],
        },
    }

    v1 = _build_v1_persona(attributes)
    v2 = _build_v2_persona(attributes)

    # Key quotes: value should be preserved
    assert v1.get("key_quotes", {}).get("value") == attributes["key_quotes"]["value"]
    assert v2.get("key_quotes", {}).get("value") == attributes["key_quotes"]["value"]

    # Key quotes: evidence should be present and non-empty (parity on existence/length)
    v1_evd = v1.get("key_quotes", {}).get("evidence", [])
    v2_evd = v2.get("key_quotes", {}).get("evidence", [])
    assert isinstance(v1_evd, list)
    assert isinstance(v2_evd, list)
    assert len(v1_evd) == len(attributes["key_quotes"]["evidence"])  # passthrough
    assert len(v2_evd) == len(attributes["key_quotes"]["evidence"])  # passthrough


def test_demographics_structured_schema_and_value_carry():
    attributes = {
        "name": "Bob",
        "demographics": {
            "value": "10+ years experience, based in Berlin, finance industry",
            "confidence": 0.7,
            "evidence": [
                "I've been in finance analytics for over a decade in Berlin",
            ],
        },
        "goals_and_motivations": {"value": "Automation", "evidence": []},
        "challenges_and_frustrations": {"value": "Legacy tools", "evidence": []},
        "key_quotes": {"value": "We need better governance", "evidence": []},
    }

    v1 = _build_v1_persona(attributes)
    v2 = _build_v2_persona(attributes)

    # V1: should expose structured_demographics or demographics with structured keys
    v1_struct = v1.get("structured_demographics") or v1.get("demographics", {})
    # Normalize to dict if it's a Pydantic model instance
    if hasattr(v1_struct, "model_dump"):
        v1_struct = v1_struct.model_dump()
    assert isinstance(v1_struct, dict)
    for k in [
        "experience_level",
        "industry",
        "location",
        "professional_context",
        "roles",
        "age_range",
    ]:
        assert k in v1_struct, f"V1 structured demographics missing: {k}"

    # V2: demographics is already structured and must contain the same keys
    v2_demo = v2.get("demographics", {})
    # Normalize to dict if it's a Pydantic model instance
    if hasattr(v2_demo, "model_dump"):
        v2_demo = v2_demo.model_dump()
    assert isinstance(v2_demo, dict)
    for k in [
        "experience_level",
        "industry",
        "location",
        "professional_context",
        "roles",
        "age_range",
    ]:
        assert k in v2_demo, f"V2 structured demographics missing: {k}"

    # V2: ensure professional_context.value exists as a string (content may be derived by PersonaBuilder)
    pc = v2_demo.get("professional_context", {})
    assert isinstance(pc, dict)
    assert isinstance(pc.get("value", ""), str)
