import os
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


def test_v2_evidence_populates_offsets_and_speaker(monkeypatch, facade):
    # Arrange: transcript for a single participant with sentences overlapping trait values
    transcript = [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": "I work in finance in Berlin. Dashboards save me hours each week.",
        }
    ]
    attrs = {
        "name": "Alice",
        "demographics": {
            "value": "based in Berlin, finance industry",
            "confidence": 0.7,
            "evidence": [],
        },
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
    meta = p.get("_evidence_linking_v2")
    assert meta and isinstance(meta, dict)
    ev_map = meta.get("evidence_map") or {}
    # Should have evidence for goals and demographics
    assert "goals_and_motivations" in ev_map
    goals_items = ev_map["goals_and_motivations"]
    assert goals_items and isinstance(goals_items[0].get("start_char"), int)
    assert isinstance(goals_items[0].get("end_char"), int)
    assert goals_items[0].get("speaker") == "S1"
    # Metrics present and offset completeness > 0
    metrics = meta.get("metrics") or {}
    assert "offset_completeness" in metrics
    assert metrics["offset_completeness"] > 0


def test_v2_cross_field_dedup_protects_key_quotes(monkeypatch, facade):
    transcript = [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": "I need better dashboards to speed up my analysis pipeline.",
        }
    ]
    attrs = {
        "name": "Bob",
        "goals_and_motivations": {
            "value": "need better dashboards",
            "confidence": 0.7,
            "evidence": [],
        },
        "challenges_and_frustrations": {
            "value": "need better dashboards",
            "confidence": 0.7,
            "evidence": [],
        },
        # Existing key_quotes evidence should be preserved (protection on by default)
        "key_quotes": {
            "value": "Representative quotes",
            "confidence": 0.7,
            "evidence": ["KEEP THIS"],
        },
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    p = personas[0]
    # EvidenceLinking V2 should not write into key_quotes (protection enabled)
    ev_map = p.get("_evidence_linking_v2", {}).get("evidence_map", {})
    assert "key_quotes" not in ev_map
    # Cross-field dedup: the same quote should not appear under both fields simultaneously
    count = 0
    for f in ("goals_and_motivations", "challenges_and_frustrations"):
        count += len(ev_map.get(f, []))
    assert count <= 1


def test_v2_keyword_overlap_rejects_low_quality(monkeypatch, facade):
    transcript = [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": "We discussed quarterly planning and reporting processes.",
        }
    ]
    attrs = {
        "name": "Carol",
        "technology_usage": {
            "value": "machine learning",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    p = personas[0]
    ev_map = p.get("_evidence_linking_v2", {}).get("evidence_map", {})
    # technology_usage should have no evidence due to low keyword overlap
    assert "technology_usage" not in ev_map or len(ev_map["technology_usage"]) == 0
    metrics = p.get("_evidence_linking_v2", {}).get("metrics", {})
    # We should have observed overlap rejections
    assert metrics.get("rejected_low_overlap", 0) > 0


def test_v2_metrics_thresholds_and_duplicates(monkeypatch, facade):
    # Two traits with overlapping content; ensure high offset completeness and low cross-field duplicate ratio
    transcript = [
        {
            "role": "participant",
            "speaker": "S1",
            "dialogue": (
                "Dashboards save me hours each week. I rely on dashboards to analyze KPIs quickly."
            ),
        }
    ]
    attrs = {
        "name": "Dana",
        "goals_and_motivations": {
            "value": "dashboards save me hours",
            "confidence": 0.7,
            "evidence": [],
        },
        "technology_usage": {
            "value": "dashboards analyze KPIs",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    metrics = meta.get("metrics", {})
    # High-quality signals should yield strong completeness
    assert metrics.get("offset_completeness", 0.0) >= 0.8
    # Cross-field duplicate ratio should be low due to span de-duplication
    assert metrics.get("cross_field_duplicate_ratio", 0.0) <= 0.2

    ev_map = meta.get("evidence_map", {})
    # technology_usage should be linked as well (field coverage)
    assert "technology_usage" in ev_map and len(ev_map["technology_usage"]) >= 1


def test_v2_speaker_and_speaker_id_consistency(monkeypatch, facade):
    # Mixed usage of speaker and speaker_id should attribute consistently
    transcript = [
        {
            "role": "participant",
            "speaker_id": "U1",
            "dialogue": "I use dashboards daily.",
        },
        {
            "role": "participant",
            "speaker": "U1",
            "dialogue": "They help me track KPIs.",
        },
    ]
    attrs = {
        "name": "",
        "goals_and_motivations": {"value": "dashboards", "evidence": []},
        "key_quotes": {"value": "", "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    # Should produce a single persona for U1, regardless of field naming
    assert isinstance(personas, list) and len(personas) == 1
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    assert meta.get("scope_meta", {}).get("speaker") == "U1"


def test_v2_mixed_speaker_fields_items_use_normalized_speaker(monkeypatch, facade):
    # Mixed transcript: some segments use speaker, others speaker_id; all should normalize to one speaker
    transcript = [
        {
            "role": "participant",
            "speaker": "U1",
            "dialogue": "I use dashboards every day to track KPIs.",
        },
        {
            "role": "participant",
            "speaker_id": "U1",
            "dialogue": "Dashboards help me find issues faster.",
        },
    ]
    attrs = {
        "name": "",
        "goals_and_motivations": {
            "value": "dashboards",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    assert isinstance(personas, list) and len(personas) == 1
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    assert meta.get("scope_meta", {}).get("speaker") == "U1"
    ev_map = meta.get("evidence_map", {})
    # Evidence items should carry normalized 'speaker' field and not depend on 'speaker_id'
    items = ev_map.get("goals_and_motivations", [])
    assert items
    for it in items:
        assert it.get("speaker") == "U1"
        # ensure we didn't leak any 'speaker_id' key into items
        assert "speaker_id" not in it


def test_v2_both_speaker_and_speaker_id_present_prefer_speaker_id(monkeypatch, facade):
    # If both keys exist on a segment with different values, speaker_id takes precedence
    transcript = [
        {
            "role": "participant",
            "speaker": "Alias",
            "speaker_id": "U2",
            "dialogue": "I rely on dashboards to analyze KPIs quickly.",
        },
        {
            "role": "participant",
            "speaker": "Alias",
            "speaker_id": "U2",
            "dialogue": "Dashboards save me time.",
        },
    ]
    attrs = {
        "name": "",
        "goals_and_motivations": {
            "value": "dashboards",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    assert isinstance(personas, list) and len(personas) == 1
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    assert meta.get("scope_meta", {}).get("speaker") == "U2"
    ev_map = meta.get("evidence_map", {})
    items = ev_map.get("goals_and_motivations", [])
    assert items
    for it in items:
        assert it.get("speaker") == "U2"


def test_v2_technology_usage_field_is_linked_with_speaker_and_offsets(
    monkeypatch, facade
):
    # Explicit coverage for technology_usage V2 field linking
    transcript = [
        {
            "role": "participant",
            "speaker": "U3",
            "dialogue": "We use dashboards and ML-powered KPIs monitoring on a daily basis.",
        }
    ]
    attrs = {
        "name": "",
        "technology_usage": {
            "value": "dashboards and KPIs",
            "confidence": 0.7,
            "evidence": [],
        },
        "key_quotes": {"value": "", "confidence": 0.7, "evidence": []},
    }
    _patch_attribute_extractor(monkeypatch, attrs)

    personas = asyncio.run(facade.form_personas_from_transcript(transcript))
    assert isinstance(personas, list) and len(personas) == 1
    p = personas[0]
    meta = p.get("_evidence_linking_v2", {})
    ev_map = meta.get("evidence_map", {})
    assert "technology_usage" in ev_map and len(ev_map["technology_usage"]) >= 1
    item = ev_map["technology_usage"][0]
    assert isinstance(item.get("start_char"), int) and isinstance(
        item.get("end_char"), int
    )
    assert item.get("speaker") == "U3"
