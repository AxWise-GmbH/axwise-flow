import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


class DummyLLMService:
    async def generate_response(self, *args, **kwargs):
        raise NotImplementedError


def _build_v2_persona(attributes: dict) -> dict:
    facade = PersonaFormationFacade(DummyLLMService())
    # Intentionally call the internal helper to avoid any LLM work
    return facade._make_persona_from_attributes(attributes)


def test_key_quotes_extractor_dedup_and_trim():
    attributes = {
        "name": "Test",
        "demographics": {"value": "", "evidence": []},
        "key_quotes": {
            "value": "",
            "evidence": [
                "  I love dashboards  ",
                "I love dashboards",
                None,
                "",
                "We automate a lot",
                "We automate a lot",
            ],
        },
    }

    v2 = _build_v2_persona(attributes)
    ev = v2.get("key_quotes", {}).get("evidence", [])
    assert isinstance(ev, list)
    # Expect de-duplicated and trimmed entries
    assert ev == ["I love dashboards", "We automate a lot"]
    # Value should be auto-populated to a non-empty string
    assert isinstance(v2.get("key_quotes", {}).get("value", ""), str)
    assert v2["key_quotes"]["value"]


def test_key_quotes_extractor_limits_to_7_items():
    quotes = [f"Quote {i}" for i in range(20)]
    attributes = {
        "name": "Test",
        "demographics": {"value": "", "evidence": []},
        "key_quotes": {"value": "", "evidence": quotes},
    }
    v2 = _build_v2_persona(attributes)
    ev = v2.get("key_quotes", {}).get("evidence", [])
    assert len(ev) <= 7
    # Ensure order is preserved as a prefix of the input when present
    if ev:
        assert ev == quotes[: len(ev)]
