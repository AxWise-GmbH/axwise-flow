import asyncio
import pytest

from backend.services.processing.persona_formation_v2.facade import PersonaFormationFacade


class DummyLLMService:
    async def analyze(self, *args, **kwargs):
        return {}


@pytest.fixture(autouse=True)
def enable_evidence_linking_v2(monkeypatch):
    monkeypatch.setenv("EVIDENCE_LINKING_V2", "true")
    yield
    monkeypatch.delenv("EVIDENCE_LINKING_V2", raising=False)


@pytest.fixture
def facade():
    return PersonaFormationFacade(DummyLLMService())


def _patch_attribute_extractor(monkeypatch, return_attrs):
    # Patch the AttributeExtractor to avoid real LLM calls
    import backend.services.processing.attribute_extractor as ae

    async def _fake_extract(self, text, role="Participant", scope_meta=None):
        return return_attrs

    monkeypatch.setattr(ae.AttributeExtractor, "extract_attributes_from_text", _fake_extract)


def test_hygiene_filters_drop_question_like_evidence(monkeypatch, facade):
    # Interviewer-style question leaked into participant scope due to mislabeling
    transcript = [
        {"role": "participant", "speaker": "S1", "dialogue": "Q — How do you budget for tools?"},
        {"role": "participant", "speaker": "S1", "dialogue": "I budget 10k EUR for tools annually."},
    ]
    attrs = {
        "name": "",
        "goals_and_motivations": {
            "value": "budget for tools",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    assert personas and isinstance(personas, list)
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    ev_map = meta.get("evidence_map", {})
    items = ev_map.get("goals_and_motivations", [])
    assert items, "Expected evidence items for goals_and_motivations"

    # Ensure no question-like lines were accepted
    for it in items:
        q = (it.get("quote") or "").strip()
        assert not q.lower().startswith(("q:", "question:", "interviewer:", "researcher:", "moderator:"))
        assert not q.endswith("?")

    # Also ensure persona field evidence strings (if present) are filtered
    field = p.get("goals_and_motivations") or {}
    if isinstance(field, dict):
        for q in field.get("evidence", []):
            qs = (q or "").strip()
            assert not qs.lower().startswith(("q:", "question:", "interviewer:", "researcher:", "moderator:"))
            assert not qs.endswith("?")

