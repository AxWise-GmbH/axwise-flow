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


@pytest.mark.parametrize(
    "goals_evidence",
    [
        [],  # empty
        [
            None,
            "  Improve reporting  ",
            "Improve reporting",
            123,
            "",
        ],  # mixed types + dups + whitespace
        [f"Item {i%3}" for i in range(12)],  # 10+ items with duplicates
    ],
)
@pytest.mark.parametrize(
    "challenges_evidence",
    [
        [],
        ["  Legacy tools  ", None, "Legacy tools", 0, ""],
        [f"Pain {i%2}" for i in range(15)],
    ],
)
def test_slice2_parity_goals_challenges(goals_evidence, challenges_evidence):
    attributes = {
        "name": "Case",
        "demographics": {"value": "", "evidence": []},
        "goals_and_motivations": {
            "value": "Improve reporting",
            "evidence": goals_evidence,
            "confidence": 0.6,
        },
        "challenges_and_frustrations": {
            "value": "Legacy tools",
            "evidence": challenges_evidence,
            "confidence": 0.65,
        },
        "key_quotes": {"value": "", "evidence": []},
    }

    v1 = _build_v1_persona(attributes)
    v2 = _build_v2_persona(attributes)

    # Compare V1 vs V2 on presence and lengths (normalized behavior)
    for field in ("goals_and_motivations", "challenges_and_frustrations"):
        v1f = v1.get(field, {})
        v2f = v2.get(field, {})
        assert isinstance(v1f, dict) and isinstance(v2f, dict)
        # Values should carry through as strings
        assert isinstance(v1f.get("value", ""), str)
        assert isinstance(v2f.get("value", ""), str)
        # Evidence should be lists in both
        v1_evd = [
            e for e in v1f.get("evidence", []) if isinstance(e, str) and e.strip()
        ]
        v2_evd = v2f.get("evidence", [])
        assert isinstance(v2_evd, list)
        # V2 evidence should be a normalized subset (trimmed, de-duplicated) of the ORIGINAL INPUT for that field
        input_trimmed_set = {
            (e.strip())
            for e in (attributes[field].get("evidence") or [])
            if isinstance(e, str) and e.strip()
        }
        if input_trimmed_set:
            for e in v2_evd:
                assert isinstance(e, str) and e.strip()
                assert e in input_trimmed_set
            # V2 should not exceed unique non-empty inputs
            assert len(v2_evd) <= len(input_trimmed_set)
        else:
            # If no inputs were provided, accept builder defaults; parity with V1 length is required
            assert len(v2_evd) == len(v1_evd)
