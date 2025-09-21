import asyncio
import os
import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


class DummyLLMService:
    async def analyze(self, *args, **kwargs):
        return {}


def _simple_transcript():
    return [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": "I use dashboards daily to save time.",
        }
    ]


def test_quality_gate_invoked_when_flag_enabled(monkeypatch):
    # Enable gate
    monkeypatch.setenv("PERSONA_QUALITY_GATE", "true")

    # Patch the PersonaQualityGate.improve method to record invocation
    from backend.services.processing.persona_formation_v2.postprocessing.quality import (
        PersonaQualityGate,
    )

    called = {"flag": False}

    async def fake_improve(self, personas, context=None):
        called["flag"] = True
        return personas

    monkeypatch.setattr(PersonaQualityGate, "improve", fake_improve)

    # Act
    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    # Assert
    assert personas and isinstance(personas, list)
    assert called["flag"] is True

    # Cleanup flag
    monkeypatch.delenv("PERSONA_QUALITY_GATE", raising=False)


def test_quality_gate_not_invoked_when_flag_disabled(monkeypatch):
    # Ensure flag disabled
    monkeypatch.delenv("PERSONA_QUALITY_GATE", raising=False)

    from backend.services.processing.persona_formation_v2.postprocessing.quality import (
        PersonaQualityGate,
    )

    called = {"flag": False}

    async def fake_improve(self, personas, context=None):
        called["flag"] = True
        return personas

    monkeypatch.setattr(PersonaQualityGate, "improve", fake_improve)

    # Act
    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    # Assert: personas produced, but gate not called
    assert personas and isinstance(personas, list)
    assert called["flag"] is False
