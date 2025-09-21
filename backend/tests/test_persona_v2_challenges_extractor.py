import pytest

from backend.services.processing.persona_formation_v2.extractors import ChallengesExtractor
from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade
from backend.services.processing.persona_builder import PersonaBuilder, persona_to_dict


class DummyLLMService:
    async def generate_response(self, *args, **kwargs):
        raise NotImplementedError


def test_challenges_extractor_evidence_trim_and_dedup():
    ex = ChallengesExtractor()
    attrs = {
        "challenges_and_frustrations": {
            "value": "  Legacy tools  ",
            "confidence": "0.85",
            "evidence": [
                "  Legacy tools  ",
                "Legacy tools",
                "",
                None,
                123,
                "Data silos",
            ],
        }
    }
    out = ex.from_attributes(attrs)
    assert out["value"] == "Legacy tools"
    assert out["confidence"] == pytest.approx(0.85)
    # Evidence should be trimmed, deduped (stable), non-strings removed
    assert out["evidence"] == [
        "Legacy tools",
        "Data silos",
    ]


def _build_v1_persona(attributes: dict) -> dict:
    builder = PersonaBuilder()
    persona = builder.build_persona_from_attributes(attributes, role="Participant")
    return persona_to_dict(persona)


def _build_v2_persona(attributes: dict) -> dict:
    facade = PersonaFormationFacade(DummyLLMService())
    return facade._make_persona_from_attributes(attributes)


def test_challenges_parity_value_and_evidence_passthrough():
    attributes = {
        "name": "Eve",
        "demographics": {"value": "Senior analyst", "evidence": ["10+ yrs"]},
        "goals_and_motivations": {"value": "Automation", "evidence": []},
        "challenges_and_frustrations": {
            "value": "Legacy tools",
            "confidence": 0.75,
            "evidence": ["We are stuck with legacy tools"],
        },
        "key_quotes": {"value": "...", "evidence": []},
    }
    v1 = _build_v1_persona(attributes)
    v2 = _build_v2_persona(attributes)

    # Value parity: keep the input value
    assert v1.get("challenges_and_frustrations", {}).get("value") == "Legacy tools"
    assert v2.get("challenges_and_frustrations", {}).get("value") == "Legacy tools"

    # Evidence passthrough parity (length)
    v1_e = v1.get("challenges_and_frustrations", {}).get("evidence", [])
    v2_e = v2.get("challenges_and_frustrations", {}).get("evidence", [])
    assert isinstance(v1_e, list) and isinstance(v2_e, list)
    assert len(v1_e) == len(attributes["challenges_and_frustrations"]["evidence"])  # passthrough
    assert len(v2_e) == len(attributes["challenges_and_frustrations"]["evidence"])  # passthrough

