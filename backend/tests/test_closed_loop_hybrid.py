from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.api.research.simulation_bridge.services import closed_loop_hybrid
from backend.services.orqaly_persona_resolution_service import (
    OrqalyTaskContext,
    resolve_orqaly_personas,
)

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_hybrid_enrichment_uses_consistent_document_id(monkeypatch):
    person = SimpleNamespace(
        id="person-1", name="Alex", stakeholder_type="Decision authority"
    )
    interview = SimpleNamespace(
        person_id="person-1",
        stakeholder_type="Decision authority",
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
        business_context=SimpleNamespace(industry="logistics"),
        config=SimpleNamespace(
            performance_profile=SimpleNamespace(value="quality_fast")
        ),
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
        "_speaker_name": "Alex",
        "stakeholder_intelligence": {
            "decision_role": "economic buyer",
            "influence_level": "high",
        },
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

    assert enriched.empirical_personas != [empirical]
    rebound = enriched.empirical_personas[0]
    assert rebound["name"] == "Alex"
    assert rebound["_speaker_name"] == "Alex"
    assert enriched.metadata["hybrid_status"] == "completed"
    assert enriched.metadata["empirical_persona_count"] == 1
    assert enriched.metadata["evidence_document_id"] == "sim_session_sim-123"
    assert enriched.metadata["audited_evidence_count"] == 1
    assert enriched.metadata["performance_profile"] == "quality_fast"
    evidence = rebound["_evidence_linking_v2"]["evidence_map"]["goals_and_motivations"][0]
    assert evidence["start_char"] == 7
    assert evidence["end_char"] == 33
    assert evidence["document_id"] == "sim_session_sim-123_person-1"
    assert rebound["stakeholder_intelligence"] == {
        "decision_role": "economic buyer",
        "influence_level": "high",
        "stakeholder_type": "Decision authority",
    }
    assert empirical["stakeholder_intelligence"] == {
        "decision_role": "economic buyer",
        "influence_level": "high",
    }
    raw_evidence = empirical["_evidence_linking_v2"]["evidence_map"][
        "goals_and_motivations"
    ][0]
    assert raw_evidence["start_char"] == 0
    assert raw_evidence["end_char"] == 1
    assert raw_evidence["document_id"] == "incorrect"
    resolution = resolve_orqaly_personas(
        enriched.empirical_personas,
        OrqalyTaskContext(
            title="Launch a physical product",
            description="Build a commercial market plan",
            research_prd_type="commercial_market_launch",
        ),
        [],
    )
    assert resolution["customer_persona"]["decision_role"] == "decision_authority"
    assert resolution["customer_persona"]["selection_eligibility"] == (
        "eligible_primary"
    )
    call = form_personas.await_args.kwargs
    assert call["transcript"] == segments
    assert call["context"]["document_id"] == "sim_session_sim-123"
    assert call["context"]["performance_profile"] == "quality_fast"


def _binding_result(
    *,
    person_type="Decision authority",
    interview_type=None,
    people=None,
    interviews=None,
):
    if people is None:
        people = [
            SimpleNamespace(
                id="person-1", name="Alex", stakeholder_type=person_type
            )
        ]
    if interviews is None:
        interviews = [
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type=interview_type or person_type,
                responses=[SimpleNamespace(response="Exact source evidence")],
            )
        ]
    return SimpleNamespace(
        simulation_id="sim-binding",
        people=people,
        interviews=interviews,
    )


def test_source_role_binding_preserves_operator_only_commercial_rejection():
    identities = closed_loop_hybrid._source_participant_identities(
        _binding_result(person_type="Operational user")
    )
    persona = {
        "name": "Alex",
        "_speaker_name": "Alex",
        "role": "Owner",
        "stakeholder_intelligence": {"decision_role": "economic buyer"},
    }
    bindings = closed_loop_hybrid._empirical_persona_bindings(
        [persona], identities
    )
    rebound = closed_loop_hybrid._bind_stakeholder_types(bindings)

    with pytest.raises(ValueError, match="economic buyer or decision authority"):
        resolve_orqaly_personas(
            rebound,
            OrqalyTaskContext(
                title="Launch a physical product",
                description="Build a commercial market plan",
                research_prd_type="commercial_market_launch",
            ),
            [],
        )
    assert persona["stakeholder_intelligence"] == {
        "decision_role": "economic buyer"
    }


def test_source_role_binding_rejects_unknown_empirical_speaker():
    identities = closed_loop_hybrid._source_participant_identities(
        _binding_result()
    )

    with pytest.raises(RuntimeError, match="exact source speaker identity"):
        closed_loop_hybrid._empirical_persona_bindings(
            [
                {
                    "name": "Unknown speaker",
                    "_speaker_name": "Unknown speaker",
                }
            ],
            identities,
        )


@pytest.mark.parametrize(
    "persona, message",
    [
        ({"name": "Alex"}, "empirical _speaker_name"),
        (
            {"name": "Alex", "_speaker_name": "alex"},
            "matching persona and source speaker names",
        ),
        (
            {"name": "Participant 1", "_speaker_name": "Participant 1"},
            "generic empirical speaker names",
        ),
        (
            {"name": "Generated Owner", "_speaker_name": "Alex"},
            "matching persona and source speaker names",
        ),
    ],
)
def test_source_role_binding_rejects_missing_generic_near_or_conflicting_identity(
    persona, message
):
    identities = closed_loop_hybrid._source_participant_identities(
        _binding_result()
    )

    with pytest.raises(RuntimeError, match=message):
        closed_loop_hybrid._empirical_persona_bindings(
            [persona], identities
        )


def test_source_role_binding_rejects_duplicate_speaker_identity():
    result = _binding_result(
        people=[
            SimpleNamespace(
                id="person-1", name="Alex", stakeholder_type="Decision authority"
            ),
            SimpleNamespace(
                id="person-2", name="Alex", stakeholder_type="Decision authority"
            ),
        ],
        interviews=[
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="First source")],
            ),
            SimpleNamespace(
                person_id="person-2",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="Second source")],
            ),
        ],
    )

    with pytest.raises(RuntimeError, match="unique speaker names"):
        closed_loop_hybrid._source_participant_identities(result)


def test_source_role_binding_rejects_duplicate_person_identity():
    result = _binding_result(
        people=[
            SimpleNamespace(
                id="person-1", name="Alex", stakeholder_type="Decision authority"
            ),
            SimpleNamespace(
                id="person-1", name="Bea", stakeholder_type="Operational user"
            ),
        ]
    )

    with pytest.raises(RuntimeError, match="unique person IDs"):
        closed_loop_hybrid._source_participant_identities(result)


def test_source_role_binding_rejects_duplicate_empirical_identity():
    identities = closed_loop_hybrid._source_participant_identities(
        _binding_result()
    )
    persona = {"name": "Alex", "_speaker_name": "Alex"}

    with pytest.raises(RuntimeError, match="unique empirical speaker identities"):
        closed_loop_hybrid._empirical_persona_bindings(
            [persona, dict(persona)], identities
        )


def test_source_role_binding_rejects_missing_empirical_identity():
    result = _binding_result(
        people=[
            SimpleNamespace(
                id="person-1", name="Alex", stakeholder_type="Decision authority"
            ),
            SimpleNamespace(
                id="person-2", name="Bea", stakeholder_type="Operational user"
            ),
        ],
        interviews=[
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="First source")],
            ),
            SimpleNamespace(
                person_id="person-2",
                stakeholder_type="Operational user",
                responses=[SimpleNamespace(response="Second source")],
            ),
        ],
    )
    identities = closed_loop_hybrid._source_participant_identities(result)

    with pytest.raises(RuntimeError, match="every source speaker: Bea"):
        closed_loop_hybrid._empirical_persona_bindings(
            [{"name": "Alex", "_speaker_name": "Alex"}], identities
        )


def test_source_role_binding_rejects_duplicate_or_missing_interview():
    duplicate = _binding_result(
        interviews=[
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="First source")],
            ),
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="Second source")],
            ),
        ]
    )
    with pytest.raises(RuntimeError, match="exactly one interview per person ID"):
        closed_loop_hybrid._source_participant_identities(duplicate)

    with pytest.raises(RuntimeError, match="exactly one interview for every person ID"):
        closed_loop_hybrid._source_participant_identities(
            _binding_result(interviews=[])
        )


def test_source_role_binding_rejects_person_interview_role_contradiction():
    result = _binding_result(
        person_type="Decision authority",
        interview_type="Operational user",
    )

    with pytest.raises(RuntimeError, match="matching person/interview stakeholder types"):
        closed_loop_hybrid._source_participant_identities(result)


def test_evidence_audit_rejects_cross_speaker_identity():
    identities = closed_loop_hybrid._source_participant_identities(
        _binding_result()
    )
    persona = {
        "name": "Alex",
        "_speaker_name": "Alex",
        "evidence": [
            {
                "quote": "Exact source evidence",
                "speaker": "Another speaker",
                "start_char": 0,
                "end_char": 21,
            }
        ],
    }
    bindings = closed_loop_hybrid._empirical_persona_bindings(
        [persona], identities
    )

    with pytest.raises(RuntimeError, match="does not match.*source identity"):
        closed_loop_hybrid._audit_evidence_offsets(bindings)


def test_failed_evidence_audit_does_not_mutate_raw_pipeline_persona():
    result = _binding_result(
        people=[
            SimpleNamespace(
                id="person-1", name="Alex", stakeholder_type="Decision authority"
            ),
            SimpleNamespace(
                id="person-2", name="Bea", stakeholder_type="Operational user"
            ),
        ],
        interviews=[
            SimpleNamespace(
                person_id="person-1",
                stakeholder_type="Decision authority",
                responses=[SimpleNamespace(response="Exact source evidence")],
            ),
            SimpleNamespace(
                person_id="person-2",
                stakeholder_type="Operational user",
                responses=[SimpleNamespace(response="Second source evidence")],
            ),
        ],
    )
    identities = closed_loop_hybrid._source_participant_identities(
        result
    )
    raw_personas = [
        {
            "name": "Alex",
            "_speaker_name": "Alex",
            "stakeholder_intelligence": {"source_note": "keep-alex"},
            "evidence": [
                {
                    "quote": "Exact source evidence",
                    "speaker": "Alex",
                    "start_char": 99,
                    "end_char": 100,
                    "document_id": "raw-valid",
                }
            ],
        },
        {
            "name": "Bea",
            "_speaker_name": "Bea",
            "stakeholder_intelligence": {"source_note": "keep-bea"},
            "evidence": [
                {
                    "quote": "Not in the source",
                    "speaker": "Bea",
                    "start_char": 101,
                    "end_char": 102,
                    "document_id": "raw-invalid",
                }
            ],
        },
    ]
    raw_snapshot = deepcopy(raw_personas)
    bindings = closed_loop_hybrid._empirical_persona_bindings(
        raw_personas, identities
    )
    rebound = closed_loop_hybrid._bind_stakeholder_types(bindings)
    rebound_bindings = [
        (persona, identity)
        for persona, (_, identity) in zip(rebound, bindings)
    ]

    with pytest.raises(RuntimeError, match="not an exact source substring"):
        closed_loop_hybrid._audit_evidence_offsets(rebound_bindings)

    assert raw_personas == raw_snapshot


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
