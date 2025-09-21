import asyncio
import pytest

from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade


class DummyLLMService:
    async def analyze(self, *args, **kwargs):
        return {}


def _simple_transcript():
    return [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": "I use dashboards daily to save time and track KPIs.",
        }
    ]


def _boom(*args, **kwargs):
    raise RuntimeError("boom")


@pytest.mark.asyncio
async def test_enhanced_fallback_used_when_exception(monkeypatch):
    # Ensure events don't interfere
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "false")
    monkeypatch.setenv("PERSONA_FALLBACK_ENHANCED", "true")

    # Force persona assembly to fail
    monkeypatch.setattr(
        PersonaFormationFacade, "_make_persona_from_attributes", _boom
    )

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(_simple_transcript())

    assert personas and isinstance(personas, list)
    assert personas[0].get("_fallback", {}).get("strategy") == "enhanced_safety_net"

    monkeypatch.delenv("PERSONA_FALLBACK_ENHANCED", raising=False)


@pytest.mark.asyncio
async def test_enhanced_fallback_can_be_disabled(monkeypatch):
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "false")
    monkeypatch.setenv("PERSONA_FALLBACK_ENHANCED", "false")

    monkeypatch.setattr(
        PersonaFormationFacade, "_make_persona_from_attributes", _boom
    )

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(_simple_transcript())

    # With enhanced fallback disabled, and forced failure during assembly, expect empty
    assert personas == []

    monkeypatch.delenv("PERSONA_FALLBACK_ENHANCED", raising=False)

