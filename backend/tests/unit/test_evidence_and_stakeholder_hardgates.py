import pytest

from backend.services.processing.evidence_linking_service import EvidenceLinkingService
from backend.core.processing_pipeline import _create_stakeholder_intelligence_summary
from backend.tests.mocks.mock_llm_service import MockLLMService


@pytest.mark.asyncio
async def test_evidence_hard_gates_drop_researcher_and_keep_participant():
    els = EvidenceLinkingService(MockLLMService())

    attributes = {
        "goals_and_motivations": {"value": "need website fast"},
    }

    scoped_text = (
        "[00:00] Researcher: As a Berlin Marketing Manager, how would a website help?"
        "\n[00:01] Participant: I need a website for my café and I want it fast."
    )

    scope_meta = {"speaker": "Participant", "document_id": "doc1"}

    enhanced, evidence_map = els.link_evidence_to_attributes_v2(
        attributes=attributes,
        scoped_text=scoped_text,
        scope_meta=scope_meta,
        protect_key_quotes=True,
    )

    # Should produce evidence only from the participant line; researcher line must be dropped
    items = evidence_map.get("goals_and_motivations", [])
    assert len(items) >= 1, "Expected at least one valid evidence item from participant"

    for it in items:
        q = it.get("quote") or ""
        assert (
            "Researcher:" not in q
        ), "Researcher-labelled lines must not pass hygiene gates"
        assert (
            "As a Berlin Marketing Manager" not in q
        ), "Tracked contamination phrase must not appear in evidence"
        assert (
            it.get("start_char") is not None and it.get("end_char") is not None
        ), "Offsets must be populated"
        assert (
            it.get("speaker") or ""
        ).strip() == "Participant", "Speaker must be Participant (from scope_meta)"


def test_stakeholder_type_prefers_persona_metadata_category():
    # Persona with generic stakeholder_intelligence and multiple fallbacks
    personas = [
        {
            "name": "Berlin Agile Marketer",
            "stakeholder_intelligence": {"stakeholder_type": "primary_customer"},
            "persona_metadata": {
                "stakeholder_category": "Berlin Marketing Manager (SME)"
            },
            "role": "Manager",
            "structured_demographics": {"roles": {"value": "Professional role"}},
            "demographics": {"role": "Generic"},
            "goals_and_motivations": {"value": "..."},
            "challenges_and_frustrations": {"value": "..."},
        }
    ]

    summary = _create_stakeholder_intelligence_summary(personas)
    detected = summary.get("detected_stakeholders", [])
    assert len(detected) == 1
    assert (
        detected[0]["stakeholder_type"] == "Berlin Marketing Manager (SME)"
    ), "Should prefer persona_metadata.stakeholder_category over persona.role and demographics"
