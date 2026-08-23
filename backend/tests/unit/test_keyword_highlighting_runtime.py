"""Contracts for safe, useful durable persona keyword highlighting."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from backend.services.processing import keyword_highlighter as highlighter_module
from backend.services.processing.keyword_highlighter import (
    ContextAwareKeywordHighlighter,
)
from backend.services.processing.persona_formation_v2.postprocessing.keyword_highlighting import (
    PersonaKeywordHighlighter,
)


pytestmark = pytest.mark.contract


def test_structured_evidence_is_highlighted_as_text_and_keeps_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    detected_samples: list[str] = []

    async def fake_detect(self, sample_content: str):
        assert isinstance(sample_content, str)
        detected_samples.append(sample_content)
        return {"domain": "analytics"}

    def fake_highlight(self, evidence, trait_name, trait_description):
        assert evidence
        assert all(isinstance(item, str) for item in evidence)
        assert isinstance(trait_description, str)
        return [f"**{item}**" for item in evidence]

    monkeypatch.setattr(
        ContextAwareKeywordHighlighter,
        "detect_research_domain_and_keywords",
        fake_detect,
    )
    monkeypatch.setattr(
        ContextAwareKeywordHighlighter,
        "enhance_evidence_highlighting",
        fake_highlight,
    )
    personas = [
        {
            "goals_and_motivations": {
                "value": {"value": "Track operating KPIs"},
                "evidence": [
                    {
                        "quote": "I use dashboards daily to track operating KPIs.",
                        "document_id": "doc-1",
                        "speaker": "S1",
                    },
                    {"text": "Dashboards save several hours every week.", "offset": 42},
                    {"document_id": "metadata-only"},
                ],
            }
        }
    ]

    result = asyncio.run(PersonaKeywordHighlighter().enhance(personas))

    evidence = result[0]["goals_and_motivations"]["evidence"]
    assert detected_samples == [
        "I use dashboards daily to track operating KPIs.\n"
        "Dashboards save several hours every week."
    ]
    assert evidence[0] == {
        "quote": "**I use dashboards daily to track operating KPIs.**",
        "document_id": "doc-1",
        "speaker": "S1",
    }
    assert evidence[1] == {
        "text": "**Dashboards save several hours every week.**",
        "offset": 42,
    }
    assert evidence[2] == {"document_id": "metadata-only"}


def test_empty_or_unusable_evidence_skips_domain_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def fake_detect(self, sample_content: str):
        nonlocal calls
        calls += 1
        return {}

    monkeypatch.setattr(
        ContextAwareKeywordHighlighter,
        "detect_research_domain_and_keywords",
        fake_detect,
    )
    personas = [
        {
            "goals_and_motivations": {
                "value": "Improve operations",
                "evidence": [{"document_id": "doc-1"}],
            },
            "challenges_and_frustrations": {"value": "", "evidence": []},
        }
    ]

    result = asyncio.run(
        PersonaKeywordHighlighter().enhance(
            personas,
            context={"industry": "analytics"},
        )
    )

    assert result is personas
    assert calls == 0


def test_quality_fast_skips_only_optional_domain_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model_calls = 0
    highlight_calls = 0

    async def fake_detect(self, sample_content: str):
        nonlocal model_calls
        model_calls += 1
        return {}

    def fake_highlight(self, evidence, trait_name, trait_description):
        nonlocal highlight_calls
        highlight_calls += 1
        return [f"**{item}**" for item in evidence]

    monkeypatch.setattr(
        ContextAwareKeywordHighlighter,
        "detect_research_domain_and_keywords",
        fake_detect,
    )
    monkeypatch.setattr(
        ContextAwareKeywordHighlighter,
        "enhance_evidence_highlighting",
        fake_highlight,
    )
    personas = [
        {
            "goals_and_motivations": {
                "value": "Track operating KPIs",
                "evidence": [
                    {"quote": "I track operating KPIs in a dashboard."}
                ],
            }
        }
    ]

    result = asyncio.run(
        PersonaKeywordHighlighter().enhance(
            personas,
            context={"performance_profile": "quality_fast"},
        )
    )

    assert model_calls == 0
    assert highlight_calls == 1
    assert result[0]["goals_and_motivations"]["evidence"] == [
        {"quote": "**I track operating KPIs in a dashboard.**"}
    ]


def test_direct_highlighter_never_passes_dict_to_regex() -> None:
    structured = {"quote": "Dashboards save time", "speaker": "S1"}
    highlighter = ContextAwareKeywordHighlighter()

    result = highlighter.enhance_evidence_highlighting(
        [structured, "Dashboards save time"],
        "goals_and_motivations",
        "Save time with dashboards",
    )

    assert result[0] is structured
    assert isinstance(result[1], str)


def test_short_context_uses_local_fallback_without_model_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_if_called(_api_key: str):
        raise AssertionError("Gemini runtime must not be created for unusable context")

    monkeypatch.setattr(
        highlighter_module,
        "get_shared_structured_utility_model",
        fail_if_called,
    )
    highlighter = ContextAwareKeywordHighlighter()

    result = asyncio.run(highlighter.detect_research_domain_and_keywords("dashboard"))

    assert result["domain"] == "general_research"
    assert result["total_keywords"] == 0


def test_source_supported_typed_domain_terms_are_applied(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output = highlighter_module.DomainAnalysis(
        research_domain="Dashboard operations",
        industry_context="Business analytics",
        core_domain_terms=["dashboards", "operating kpis"],
        technical_terms=["analytics"],
        emotional_terms=[],
        quantitative_indicators=[],
        confidence_score=0.9,
    )

    class FakeAgent:
        def __init__(self, **kwargs):
            self.validator = None

        def output_validator(self, function):
            self.validator = function
            return function

        async def run(self, _prompt, *, deps):
            validated = await self.validator(SimpleNamespace(deps=deps), output)
            return SimpleNamespace(output=validated)

    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        highlighter_module,
        "get_shared_structured_utility_model",
        lambda _api_key: object(),
    )
    monkeypatch.setattr(highlighter_module, "Agent", FakeAgent)
    highlighter = ContextAwareKeywordHighlighter()

    result = asyncio.run(
        highlighter.detect_research_domain_and_keywords(
            "I use dashboards and analytics daily to track operating KPIs."
        )
    )

    assert result["domain"] == "Dashboard operations"
    assert result["confidence"] == 0.9
    assert set(result["all_keywords"]) == {
        "dashboards",
        "operating kpis",
        "analytics",
    }
    assert set(result["all_keywords"]).issubset(highlighter.DOMAIN_KEYWORDS)
