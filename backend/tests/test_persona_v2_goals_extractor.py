import pytest

from backend.services.processing.persona_formation_v2.extractors import GoalsExtractor
from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade
from backend.services.processing.persona_builder import PersonaBuilder, persona_to_dict


class DummyLLMService:
    async def generate_response(self, *args, **kwargs):
        raise NotImplementedError


def test_goals_extractor_evidence_trim_and_dedup():
    ex = GoalsExtractor()
    attrs = {
        "goals_and_motivations": {
            "value": "  Improve reporting  ",
            "confidence": "0.9",
            "evidence": [
                "  Improve reporting  ",
                "Improve reporting",
                "",
                None,
                123,
                "Automate dashboards",
            ],
        }
    }
    out = ex.from_attributes(attrs)
    assert out["value"] == "Improve reporting"
    assert out["confidence"] == pytest.approx(0.9)
    # Evidence should be trimmed, deduped (stable), non-strings removed
    assert out["evidence"] == [
        "Improve reporting",
        "Automate dashboards",
    ]


def _build_v1_persona(attributes: dict) -> dict:
    builder = PersonaBuilder()
    persona = builder.build_persona_from_attributes(attributes, role="Participant")
    return persona_to_dict(persona)


def _build_v2_persona(attributes: dict) -> dict:
    facade = PersonaFormationFacade(DummyLLMService())
    return facade._make_persona_from_attributes(attributes)


def test_goals_parity_value_and_evidence_passthrough():
    attributes = {
        "name": "Dana",
        "demographics": {"value": "Senior analyst", "evidence": ["10+ yrs"]},
        "goals_and_motivations": {
            "value": "Automate dashboards",
            "confidence": 0.8,
            "evidence": ["I want to automate dashboards"],
        },
        "challenges_and_frustrations": {"value": "Legacy tools", "evidence": []},
        "key_quotes": {"value": "...", "evidence": []},
    }
    v1 = _build_v1_persona(attributes)
    v2 = _build_v2_persona(attributes)

    # Value parity: keep the input value
    assert v1.get("goals_and_motivations", {}).get("value") == "Automate dashboards"
    assert v2.get("goals_and_motivations", {}).get("value") == "Automate dashboards"

    # Evidence passthrough parity (length)
    v1_e = v1.get("goals_and_motivations", {}).get("evidence", [])
    v2_e = v2.get("goals_and_motivations", {}).get("evidence", [])
    assert isinstance(v1_e, list) and isinstance(v2_e, list)
    assert len(v1_e) == len(attributes["goals_and_motivations"]["evidence"])  # passthrough
    assert len(v2_e) == len(attributes["goals_and_motivations"]["evidence"])  # passthrough

