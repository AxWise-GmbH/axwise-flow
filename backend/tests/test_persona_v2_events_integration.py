import asyncio
import pytest

from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade
from backend.infrastructure.events.event_manager import event_manager, EventType


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


@pytest.mark.asyncio
async def test_events_emitted_when_flag_enabled(monkeypatch):
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "true")

    captured = []

    async def fake_emit(event_type, data=None):
        captured.append((event_type, data or {}))

    monkeypatch.setattr(event_manager, "emit", fake_emit)

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(_simple_transcript())

    assert personas and isinstance(personas, list)
    types = [t for (t, d) in captured]
    assert EventType.PROCESSING_STARTED in types
    assert EventType.PROCESSING_COMPLETED in types

    monkeypatch.delenv("PERSONA_FORMATION_EVENTS", raising=False)


@pytest.mark.asyncio
async def test_events_not_emitted_when_flag_disabled(monkeypatch):
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "false")

    captured = []

    async def fake_emit(event_type, data=None):
        captured.append((event_type, data or {}))

    monkeypatch.setattr(event_manager, "emit", fake_emit)

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(_simple_transcript())

    assert personas and isinstance(personas, list)
    assert captured == []

    monkeypatch.delenv("PERSONA_FORMATION_EVENTS", raising=False)

