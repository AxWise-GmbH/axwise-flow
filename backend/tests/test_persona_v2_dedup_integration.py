import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


class DummyLLMService:
    async def analyze(self, *args, **kwargs):
        return {}


def _two_participants_transcript():
    return [
        {"role": "participant", "speaker": "S1", "dialogue": "I review KPIs daily."},
        {
            "role": "participant",
            "speaker": "S2",
            "dialogue": "I review KPIs daily and save time.",
        },
    ]


@pytest.mark.asyncio
async def test_dedup_merges_personas_when_enabled(monkeypatch):
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "false")
    monkeypatch.setenv("PERSONA_DEDUP", "true")

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(
        _two_participants_transcript()
    )

    assert isinstance(personas, list)
    assert len(personas) == 1

    # Ensure we actually merged personas
    p = personas[0]
    dedup_meta = p.get("_dedup") or {}
    assert dedup_meta.get("merged_count", 0) >= 1

    monkeypatch.delenv("PERSONA_DEDUP", raising=False)


@pytest.mark.asyncio
async def test_dedup_does_nothing_when_disabled(monkeypatch):
    monkeypatch.setenv("PERSONA_FORMATION_EVENTS", "false")
    monkeypatch.setenv("PERSONA_DEDUP", "false")

    facade = PersonaFormationFacade(DummyLLMService())
    personas = await facade.form_personas_from_transcript(
        _two_participants_transcript()
    )

    assert isinstance(personas, list)
    assert len(personas) >= 2

    monkeypatch.delenv("PERSONA_DEDUP", raising=False)
