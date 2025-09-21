import asyncio
import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)
from backend.services.processing.trait_formatting_service import TraitFormattingService


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


def test_trait_formatting_invoked_when_flag_enabled(monkeypatch):
    monkeypatch.setenv("PERSONA_TRAIT_FORMATTING", "true")

    called = {"flag": False}

    async def fake_format(self, attributes):
        called["flag"] = True
        return attributes

    monkeypatch.setattr(TraitFormattingService, "format_trait_values", fake_format)

    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    assert personas and isinstance(personas, list)
    assert called["flag"] is True

    monkeypatch.delenv("PERSONA_TRAIT_FORMATTING", raising=False)


def test_trait_formatting_not_invoked_when_flag_disabled(monkeypatch):
    monkeypatch.setenv("PERSONA_TRAIT_FORMATTING", "false")

    called = {"flag": False}

    async def fake_format(self, attributes):
        called["flag"] = True
        return attributes

    monkeypatch.setattr(TraitFormattingService, "format_trait_values", fake_format)

    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    assert personas and isinstance(personas, list)
    assert called["flag"] is False
