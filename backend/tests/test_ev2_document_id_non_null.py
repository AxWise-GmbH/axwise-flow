import asyncio
import pytest

from backend.services.processing.persona_formation_v2.facade import (
    PersonaFormationFacade,
)


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
    # Patch the AttributeExtractor method used by the facade to avoid LLM
    import backend.services.processing.attribute_extractor as ae

    async def _fake_extract(self, text, role="Participant", scope_meta=None):
        return return_attrs

    monkeypatch.setattr(
        ae.AttributeExtractor, "extract_attributes_from_text", _fake_extract
    )


def test_ev2_evidence_items_have_non_null_document_id(monkeypatch, facade):
    # Arrange a transcript with two documents to exercise doc_spans mapping and fallbacks
    transcript = [
        {
            "role": "participant",
            "speaker": "S1",
            "document_id": "docA",
            "dialogue": "I work in Berlin and use dashboards daily for KPI tracking.",
        },
        {
            "role": "participant",
            "speaker": "S1",
            "document_id": "docB",
            "dialogue": "Dashboards save me hours each week and streamline reporting.",
        },
    ]

    # Minimal attributes with overlapping keywords to trigger EV2 linking
    attrs = {
        "name": "Alice",
        "demographics": {"value": "based in Berlin", "confidence": 0.7, "evidence": []},
        "goals_and_motivations": {
            "value": "Dashboards save me hours",
            "confidence": 0.8,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    # Act
    personas = asyncio.run(facade.form_personas_from_transcript(transcript))

    # Assert
    assert personas and isinstance(personas, list)
    p = personas[0]
    meta = p.get("_evidence_linking_v2") or {}
    ev_map = meta.get("evidence_map") or {}
    # Collect all items across fields
    all_items = []
    for field_items in ev_map.values():
        all_items.extend(field_items or [])
    # Ensure we produced some EV2 items
    assert all_items, "Expected EV2 to produce at least one evidence item"
    # Assert document_id is non-null and non-empty for every item
    for it in all_items:
        doc_id = (it.get("document_id") or "").strip()
        assert doc_id, f"document_id should be non-empty, got: {it.get('document_id')}"

