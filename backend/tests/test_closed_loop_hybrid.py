from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.api.research.simulation_bridge.services import closed_loop_hybrid


@pytest.mark.asyncio
async def test_hybrid_enrichment_uses_consistent_document_id(monkeypatch):
    person = SimpleNamespace(id="person-1", name="Alex")
    interview = SimpleNamespace(
        person_id="person-1",
        responses=[SimpleNamespace(response="I need reliable dispatch evidence.")],
    )
    result = SimpleNamespace(
        simulation_id="sim-123",
        interviews=[interview],
        people=[person],
        empirical_personas=None,
        metadata={"existing": True},
    )
    request = SimpleNamespace(
        business_context=SimpleNamespace(industry="logistics")
    )
    segments = [
        {
            "speaker_id": "Alex",
            "role": "participant",
            "dialogue": "I need reliable dispatch evidence.",
            "document_id": "sim_session_sim-123",
        }
    ]
    formatter = SimpleNamespace(
        format_as_transcript_segments=lambda **_: segments
    )
    empirical = {
        "name": "Alex",
        "_evidence_linking_v2": {
            "evidence_map": {
                "goals_and_motivations": [
                    {
                        "quote": "reliable dispatch evidence",
                        "start_char": 0,
                        "end_char": 1,
                        "speaker": "Alex",
                        "document_id": "incorrect",
                    }
                ]
            }
        },
    }
    form_personas = AsyncMock(return_value=[empirical])
    persona_service = SimpleNamespace(form_personas_from_transcript=form_personas)

    monkeypatch.setattr(closed_loop_hybrid, "DataFormatter", lambda: formatter)
    monkeypatch.setattr(
        closed_loop_hybrid.LLMServiceFactory, "create", lambda *_: object()
    )
    monkeypatch.setattr(
        closed_loop_hybrid,
        "PersonaFormationService",
        lambda **_: persona_service,
    )

    enriched = await closed_loop_hybrid.enrich_with_empirical_personas(
        result, request
    )

    assert enriched.empirical_personas == [empirical]
    assert enriched.metadata["hybrid_status"] == "completed"
    assert enriched.metadata["empirical_persona_count"] == 1
    assert enriched.metadata["evidence_document_id"] == "sim_session_sim-123"
    assert enriched.metadata["audited_evidence_count"] == 1
    evidence = empirical["_evidence_linking_v2"]["evidence_map"]["goals_and_motivations"][0]
    assert evidence["start_char"] == 7
    assert evidence["end_char"] == 33
    assert evidence["document_id"] == "sim_session_sim-123_person-1"
    call = form_personas.await_args.kwargs
    assert call["transcript"] == segments
    assert call["context"]["document_id"] == "sim_session_sim-123"


@pytest.mark.asyncio
async def test_hybrid_enrichment_does_not_silently_degrade(monkeypatch):
    result = SimpleNamespace(
        simulation_id="sim-456",
        interviews=[object()],
        people=[object()],
        empirical_personas=None,
        metadata=None,
    )
    request = SimpleNamespace(business_context=None)
    formatter = SimpleNamespace(
        format_as_transcript_segments=lambda **_: [
            {
                "speaker_id": "Alex",
                "role": "participant",
                "dialogue": "Evidence",
                "document_id": "sim_session_sim-456",
            }
        ]
    )
    persona_service = SimpleNamespace(
        form_personas_from_transcript=AsyncMock(return_value=[])
    )
    monkeypatch.setattr(closed_loop_hybrid, "DataFormatter", lambda: formatter)
    monkeypatch.setattr(
        closed_loop_hybrid.LLMServiceFactory, "create", lambda *_: object()
    )
    monkeypatch.setattr(
        closed_loop_hybrid,
        "PersonaFormationService",
        lambda **_: persona_service,
    )

    with pytest.raises(RuntimeError, match="no empirical personas"):
        await closed_loop_hybrid.enrich_with_empirical_personas(result, request)
