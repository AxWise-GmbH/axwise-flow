"""Model-free synthetic cohort, source identity and coverage regressions."""

import copy
import hashlib
import socket

import pytest
from pydantic import ValidationError

from backend.domain.workflow_v2.simulation import (
    SimulationCandidateV1,
    SimulationRequestV1,
    SimulationV1,
    build_simulation,
    simulation_plan,
    validate_simulation,
    validate_simulation_grounding,
)
from backend.domain.workflow_v2.transcript_corpus import extract_source_quote
from backend.domain.workflow_v2.wire import canonical_hash

pytestmark = pytest.mark.contract
OPERATION = "e49c5125-a05c-49fb-93dd-f23989084d7f"
OTHER_OPERATION = "a3fc0fbe-c59b-41bc-b095-9a38df7b9c20"
SCOPE = {
    "artifactId": "17fdd706-6e92-4389-90cf-237866557afe",
    "artifactHash": "a" * 64,
    "kind": "scope",
}
SOURCE = {
    "artifactId": "b57b9807-87dd-464f-b7ef-904c07164f65",
    "artifactHash": "b" * 64,
    "kind": "transcript_corpus",
}
ANSWER = "A fictional answer with emoji 😀, combining cafe\u0301 and CRLF\r\nkept byte-exact."


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def fail(*args, **kwargs):
        raise AssertionError("simulation contracts must not use network or DNS")

    monkeypatch.setattr(socket, "getaddrinfo", fail)
    monkeypatch.setattr(socket.socket, "connect", fail)
    monkeypatch.setattr(socket.socket, "connect_ex", fail)


def request(*, groups=1, participants=1, questions=2):
    return {
        "requested": True,
        "scenario": {
            "id": "scenario",
            "description": "A fictional product planning scenario.",
            "targetAudience": "Synthetic operations teams",
            "problem": "Explore a fictional manual handoff.",
        },
        "stakeholders": [
            {
                "stakeholderId": f"group-{index}",
                "label": f"Group {index}",
                "description": "A hypothetical group, not real survey respondents.",
                "participantCount": participants,
                "countryCode": "LV",
                "locality": "Riga",
                "questions": [
                    {
                        "questionId": f"question-{q}",
                        "text": f"What hypothetical constraint {q} matters?",
                    }
                    for q in range(questions)
                ],
            }
            for index in range(groups)
        ],
        "grounding": {"mode": "scenario_only", "sourceArtifacts": []},
        "sampling": {"seed": 19, "profileVersion": "hash_uniform_v1"},
        "responseStyle": "mixed",
        "generationProfile": "bounded_v1",
    }


def candidate(value, operation=OPERATION):
    validated = SimulationRequestV1.model_validate(value)
    groups = {row.stakeholder_id: row for row in validated.stakeholders}
    participants, interviews = [], []
    for slot in simulation_plan(validated, operation_id=operation):
        participants.append(
            {
                **slot.model_dump(mode="json", by_alias=True),
                "displayName": "Fictional Person",
                "biography": "A hypothetical participant who coordinates a fictional team's manual work.",
                "motivations": [
                    "Explore a synthetic benefit",
                    "Compare hypothetical alternatives",
                ],
                "painPoints": ["A fictional delay", "A fictional extra handoff"],
                "communicationStyle": "A direct and explicitly hypothetical explanation.",
                "origin": "synthetic",
            }
        )
        interviews.append(
            {
                "participantId": str(slot.participant_id),
                "answers": [
                    {"questionId": question.question_id, "text": ANSWER}
                    for question in groups[slot.stakeholder_id].questions
                ],
            }
        )
    return {"participants": participants, "interviews": interviews}


def artifact(value=None, generated=None, *, grounding=()):
    value = value or request()
    return build_simulation(
        generated or candidate(value),
        request=value,
        operation_id=OPERATION,
        accepted_scope=SCOPE,
        admitted_grounding=grounding,
    )


def passage(source=SOURCE):
    text = (
        "An exact caller-admitted passage, not authority established by this fixture."
    )
    return {
        "artifact": copy.deepcopy(source),
        "entryKind": "quote",
        "entryId": "c" * 64,
        "text": text,
        "textSha256": hashlib.sha256(text.encode()).hexdigest(),
    }


def test_complete_frozen_corpus_preserves_unicode_roles_and_synthetic_origin():
    value = artifact(request(groups=2, participants=2, questions=3))
    assert value.cohort.completed_participants == 4
    assert value.cohort.completed_responses == 12
    assert value.grounding.status == "not_requested"
    assert value.sampling_reproducibility == "sampling_only"
    assert all(doc.origin == "synthetic_transcript" for doc in value.corpus.documents)
    for doc in value.corpus.documents:
        assert len(doc.turns) == 6
        assert not doc.origin_artifact_refs  # No impossible self-referential hash.
        for turn in doc.turns[1::2]:
            quote = extract_source_quote(
                value.corpus,
                document_id=doc.document_id,
                turn_id=turn.turn_id,
                participant_id=turn.participant_id,
                start=turn.start,
                end=turn.end,
            )
            assert quote.text == ANSWER and quote.origin == "synthetic_transcript"
            assert quote.speaker_role == "participant"
        with pytest.raises(ValueError):
            turn = doc.turns[0]
            extract_source_quote(
                value.corpus,
                document_id=doc.document_id,
                turn_id=turn.turn_id,
                participant_id=turn.participant_id,
                start=turn.start,
                end=turn.end,
            )
    assert (
        validate_simulation(
            value, request=value.request, operation_id=OPERATION, accepted_scope=SCOPE
        )
        == value
    )
    assert (
        SimulationV1.model_validate(value.model_dump(mode="json", by_alias=True))
        == value
    )


def test_full_maximum_cohort_has_no_silent_truncation():
    value = artifact(request(groups=4, participants=3, questions=6))
    assert (
        value.cohort.completed_participants == 12
        and value.cohort.completed_responses == 72
    )
    assert len(value.corpus.documents) == 12
    assert sum(len(doc.turns) for doc in value.corpus.documents) == 144


def test_seeded_samples_and_slot_ids_are_stable_without_global_rng():
    value = request(groups=2, participants=3)
    first = simulation_plan(value, operation_id=OPERATION)
    assert simulation_plan(value, operation_id=OPERATION) == first
    another = simulation_plan(value, operation_id=OTHER_OPERATION)
    assert [row.ocean_micros for row in first] == [row.ocean_micros for row in another]
    assert not set(row.participant_id for row in first).intersection(
        row.participant_id for row in another
    )
    changed = copy.deepcopy(value)
    changed["sampling"]["seed"] += 1
    assert [
        row.ocean_micros for row in simulation_plan(changed, operation_id=OPERATION)
    ] != [row.ocean_micros for row in first]
    for row in first:
        assert all(
            type(n) is int and 300000 <= n <= 700000
            for n in row.ocean_micros.model_dump().values()
        )


@pytest.mark.parametrize(
    "field,value",
    [
        ("requested", False),
        ("requested", 1),
        ("requested", "true"),
        ("generationProfile", "legacy"),
        ("responseStyle", "verified"),
    ],
)
def test_request_does_not_infer_authority_or_profile(field, value):
    raw = request()
    raw[field] = value
    with pytest.raises((ValueError, ValidationError)):
        SimulationRequestV1.model_validate(raw)


@pytest.mark.parametrize(
    "groups,participants,questions",
    [(0, 1, 1), (5, 1, 1), (1, 0, 1), (1, 4, 1), (1, 1, 0), (1, 1, 7)],
)
def test_request_rejects_oversized_or_empty_cohorts(groups, participants, questions):
    with pytest.raises(ValueError):
        SimulationRequestV1.model_validate(
            request(groups=groups, participants=participants, questions=questions)
        )


@pytest.mark.parametrize(
    "change",
    [
        "missing_person",
        "duplicate_person",
        "extra_person",
        "reordered_people",
        "missing_interview",
        "duplicate_interview",
        "reordered_interviews",
        "missing_answer",
        "extra_answer",
        "reordered_answers",
        "changed_question",
        "changed_country",
        "changed_locality",
        "changed_stakeholder",
        "changed_sample",
        "changed_slot",
        "changed_origin",
        "blank_biography",
        "blank_answer",
    ],
)
def test_incomplete_or_changed_generation_cannot_publish(change):
    value = request(participants=2)
    raw = candidate(value)
    if change == "missing_person":
        raw["participants"].pop()
    elif change == "duplicate_person":
        raw["participants"][1] = copy.deepcopy(raw["participants"][0])
    elif change == "extra_person":
        raw["participants"].append(copy.deepcopy(raw["participants"][0]))
    elif change == "reordered_people":
        raw["participants"].reverse()
    elif change == "missing_interview":
        raw["interviews"].pop()
    elif change == "duplicate_interview":
        raw["interviews"][1] = copy.deepcopy(raw["interviews"][0])
    elif change == "reordered_interviews":
        raw["interviews"].reverse()
    elif change == "missing_answer":
        raw["interviews"][0]["answers"].pop()
    elif change == "extra_answer":
        raw["interviews"][0]["answers"].append(
            copy.deepcopy(raw["interviews"][0]["answers"][0])
        )
    elif change == "reordered_answers":
        raw["interviews"][0]["answers"].reverse()
    elif change == "changed_question":
        raw["interviews"][0]["answers"][0]["questionId"] = "unknown"
    elif change == "changed_country":
        raw["participants"][0]["countryCode"] = "EE"
    elif change == "changed_locality":
        raw["participants"][0]["locality"] = "Tallinn"
    elif change == "changed_stakeholder":
        raw["participants"][0]["stakeholderId"] = "unknown"
    elif change == "changed_sample":
        raw["participants"][0]["oceanMicros"]["openness"] += 1
    elif change == "changed_slot":
        raw["participants"][0]["slotIndex"] = 3
    elif change == "changed_origin":
        raw["participants"][0]["origin"] = "human"
    elif change == "blank_biography":
        raw["participants"][0]["biography"] = " " * 50
    elif change == "blank_answer":
        raw["interviews"][0]["answers"][0]["text"] = " " * 50
    with pytest.raises(ValueError):
        artifact(value, raw)


@pytest.mark.parametrize(
    "field", ["requested", "scenario", "stakeholders", "sampling", "generationProfile"]
)
def test_unknown_wire_aliases_do_not_sneak_into_request(field):
    raw = request()
    raw["unexpected"] = raw[field]
    with pytest.raises(ValueError):
        SimulationRequestV1.model_validate(raw)


def test_grounding_is_explicit_and_bound_to_exact_source_reference():
    raw = request()
    raw["grounding"] = {"mode": "source_grounded", "sourceArtifacts": [SOURCE]}
    admitted = [passage()]
    value = artifact(raw, grounding=admitted)
    assert (
        value.grounding.status == "applied"
        and len(value.grounding.selected_references) == 1
    )
    assert (
        validate_simulation(
            value,
            request=raw,
            operation_id=OPERATION,
            accepted_scope=SCOPE,
            admitted_grounding=admitted,
        )
        == value
    )
    with pytest.raises(ValueError):
        artifact(raw)
    with pytest.raises(ValueError):
        artifact(request(), grounding=admitted)
    with pytest.raises(ValueError):
        artifact(raw, grounding=[passage(), passage()])
    changed = passage()
    changed["artifact"]["artifactHash"] = "d" * 64
    with pytest.raises(ValueError):
        artifact(raw, grounding=[changed])
    changed = passage()
    changed["text"] += " changed"
    with pytest.raises(ValueError):
        artifact(raw, grounding=[changed])


@pytest.mark.parametrize(
    "change",
    [
        "cohort",
        "question_text",
        "turn_id",
        "speaker",
        "document_id",
        "title",
        "source_origin",
        "missing_document",
        "limitations",
        "scope_kind",
        "request_hash",
    ],
)
def test_persisted_artifact_is_revalidated_not_self_awarded(change):
    raw = artifact().model_dump(mode="json", by_alias=True)
    if change == "cohort":
        raw["cohort"]["completedResponses"] = 1
    elif change == "question_text":
        doc = raw["corpus"]["documents"][0]
        doc["text"] = doc["text"].replace("constraint", "difference", 1)
        doc["textSha256"] = hashlib.sha256(doc["text"].encode()).hexdigest()
    elif change == "turn_id":
        raw["corpus"]["documents"][0]["turns"][1]["turnId"] = "other"
    elif change == "speaker":
        raw["corpus"]["documents"][0]["turns"][1]["participantId"] = "interviewer"
    elif change == "document_id":
        raw["corpus"]["documents"][0]["documentId"] = OTHER_OPERATION
    elif change == "title":
        raw["corpus"]["documents"][0]["title"] = "Changed title"
    elif change == "source_origin":
        raw["corpus"]["documents"][0]["origin"] = "supplied_transcript"
    elif change == "missing_document":
        raw["corpus"]["documents"] = []
    elif change == "limitations":
        raw["limitations"][0] = "These are real respondents."
    elif change == "scope_kind":
        raw["acceptedScope"]["kind"] = "research"
    elif change == "request_hash":
        raw["requestHash"] = "e" * 64
    with pytest.raises(ValueError):
        SimulationV1.model_validate(raw)


def test_external_request_scope_and_operation_bindings_cannot_change():
    value = artifact()
    changed = request()
    changed["scenario"][
        "problem"
    ] = "A different decision, without any response cache reuse."
    with pytest.raises(ValueError):
        validate_simulation(
            value, request=changed, operation_id=OPERATION, accepted_scope=SCOPE
        )
    with pytest.raises(ValueError):
        validate_simulation(
            value, request=request(), operation_id=OTHER_OPERATION, accepted_scope=SCOPE
        )
    with pytest.raises(ValueError):
        validate_simulation(
            value,
            request=request(),
            operation_id=OPERATION,
            accepted_scope={**SCOPE, "artifactHash": "e" * 64},
        )
    assert canonical_hash(changed) != canonical_hash(request())


def test_saved_grounding_binds_exact_admitted_passage_bytes_without_storing_text():
    raw = request()
    raw["grounding"] = {"mode": "source_grounded", "sourceArtifacts": [SOURCE]}
    original = passage()
    value = artifact(raw, grounding=[original])
    reference = value.grounding.selected_references[0].model_dump(
        mode="json", by_alias=True
    )
    assert reference["textSha256"] == original["textSha256"]
    assert "text" not in reference
    changed = {
        **original,
        "text": "Different independently hash-valid caller-admitted passage.",
    }
    changed["textSha256"] = hashlib.sha256(changed["text"].encode()).hexdigest()
    with pytest.raises(ValueError, match="caller-admitted passages"):
        validate_simulation(
            value,
            request=raw,
            operation_id=OPERATION,
            accepted_scope=SCOPE,
            admitted_grounding=[changed],
        )


def test_frozen_models_and_construct_copy_bypasses_are_rejected():
    valid_request = SimulationRequestV1.model_validate(request())
    with pytest.raises(ValueError):
        SimulationRequestV1.model_validate(
            valid_request.model_copy(update={"requested": False})
        )
    value = artifact()
    with pytest.raises(ValueError):
        SimulationV1.model_validate(value.model_copy(update={"origin": "human"}))
    bad_corpus = value.corpus.model_copy(update={"documents": ()})
    with pytest.raises(ValueError):
        SimulationV1.model_validate(value.model_copy(update={"corpus": bad_corpus}))
    with pytest.raises(ValueError):
        value.origin = "human"


def test_aggregate_corpus_overflow_rejects_not_truncates_generated_answers():
    value = request(groups=4, participants=3, questions=6)
    raw = candidate(value)
    for interview in raw["interviews"]:
        for answer in interview["answers"]:
            answer["text"] = "😀" * 1000
    with pytest.raises(ValueError):
        artifact(value, raw)


@pytest.mark.parametrize("seed", [True, -1, 9007199254740992, 1.5, "19"])
def test_sampling_seed_is_a_strict_safe_integer(seed):
    raw = request()
    raw["sampling"]["seed"] = seed
    with pytest.raises(ValueError):
        SimulationRequestV1.model_validate(raw)
