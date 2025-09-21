import asyncio
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
            "dialogue": "I use dashboards daily to save time and track KPIs.",
        }
    ]


def test_keyword_highlighting_invoked_when_flag_enabled(monkeypatch):
    monkeypatch.setenv("PERSONA_KEYWORD_HIGHLIGHTING", "true")

    from backend.services.processing.persona_formation_v2.postprocessing.keyword_highlighting import (
        PersonaKeywordHighlighter,
    )

    called = {"flag": False}

    async def fake_enhance(self, personas, context=None):
        called["flag"] = True
        return personas

    monkeypatch.setattr(PersonaKeywordHighlighter, "enhance", fake_enhance)

    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    assert personas and isinstance(personas, list)
    assert called["flag"] is True

    monkeypatch.delenv("PERSONA_KEYWORD_HIGHLIGHTING", raising=False)


def test_keyword_highlighting_not_invoked_when_flag_disabled(monkeypatch):
    monkeypatch.setenv("PERSONA_KEYWORD_HIGHLIGHTING", "false")

    from backend.services.processing.persona_formation_v2.postprocessing.keyword_highlighting import (
        PersonaKeywordHighlighter,
    )

    called = {"flag": False}

    async def fake_enhance(self, personas, context=None):
        called["flag"] = True
        return personas

    monkeypatch.setattr(PersonaKeywordHighlighter, "enhance", fake_enhance)

    local_facade = PersonaFormationFacade(DummyLLMService())
    personas = asyncio.run(
        local_facade.form_personas_from_transcript(_simple_transcript())
    )

    assert personas and isinstance(personas, list)
    assert called["flag"] is False
