"""Bounded synthetic simulations, with exact cohort and frozen transcript identity.

This module has no provider, persistence, scheduler, or source-access authority.
The caller must resolve owned immutable grounding before passing passages here.
Sampling is an illustrative assumption profile, never population measurement.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, field_validator, model_validator

from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    TranscriptCorpusV1,
    _FrozenCorpusModel,
    _Id,
    _Sha256,
    _exact_utf8_span,
    _identifier,
    _ordered_sequence,
    _source_bytes,
    _uuid_value,
)
from backend.domain.workflow_v2.wire import canonical_hash

MAX_SIMULATION_STAKEHOLDERS = 4
MAX_SIMULATION_PARTICIPANTS_PER_GROUP = 3
MAX_SIMULATION_QUESTIONS_PER_GROUP = 6
MAX_SIMULATION_PARTICIPANTS = 12
MAX_SIMULATION_RESPONSES = 72
MAX_SIMULATION_GROUNDING_BYTES = 32_000
MAX_SIMULATION_GROUNDING_PASSAGES = 16
SIMULATION_METHOD = "axwise.simulate.bounded.v1"
SIMULATION_SAMPLING_PROFILE = "hash_uniform_v1"
_Text = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=4000)]
_Label = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=500)]
_Country = Annotated[str, StringConstraints(strict=True, pattern=r"^[A-Z]{2}$")]
_Micros = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
_Seed = Annotated[int, Field(strict=True, ge=0, le=9_007_199_254_740_991)]
_LIMITATIONS = (
    "All participants and responses are synthetic, not human testimony.",
    "Sampling is reproducible; model-generated text is not guaranteed to repeat.",
    "This cohort does not establish population prevalence, customer demand or predictive accuracy.",
    "Personality vectors use a versioned illustrative uniform profile, not measured population traits.",
)


def _text(value: str | None) -> str | None:
    if value is not None and (not value.strip() or not _source_bytes(value)):
        raise ValueError("simulation text must be nonblank valid UTF-8")
    return value


def _unique(values: Any, label: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"simulation {label} must be unique")


class SimulationQuestionV1(_FrozenCorpusModel):
    question_id: _Id
    text: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=1000)]
    _id = field_validator("question_id")(_identifier)
    _text = field_validator("text")(_text)


class SimulationScenarioV1(_FrozenCorpusModel):
    id: _Id
    description: _Text
    target_audience: _Text
    problem: _Text
    _id = field_validator("id")(_identifier)
    _text = field_validator("description", "target_audience", "problem")(_text)


class SimulationStakeholderV1(_FrozenCorpusModel):
    stakeholder_id: _Id
    label: _Label
    description: _Text
    participant_count: Annotated[int, Field(strict=True, ge=1, le=3)]
    country_code: _Country | None
    locality: _Label | None
    questions: tuple[SimulationQuestionV1, ...] = Field(min_length=1, max_length=6)
    _id = field_validator("stakeholder_id")(_identifier)
    _text = field_validator("label", "description", "locality")(_text)
    _questions = field_validator("questions", mode="before")(_ordered_sequence)

    @model_validator(mode="after")
    def question_identity(self) -> "SimulationStakeholderV1":
        _unique([q.question_id for q in self.questions], "stakeholder question IDs")
        if self.locality is not None and self.country_code is None:
            raise ValueError("a locality requires an explicit country assignment")
        return self


class SimulationGroundingRequestV1(_FrozenCorpusModel):
    mode: Literal["scenario_only", "source_grounded"]
    source_artifacts: tuple[CorpusArtifactRefV1, ...] = Field(max_length=4)
    _refs = field_validator("source_artifacts", mode="before")(_ordered_sequence)

    @model_validator(mode="after")
    def grounding_intent(self) -> "SimulationGroundingRequestV1":
        _unique(
            [ref.artifact_id for ref in self.source_artifacts], "grounding artifact IDs"
        )
        if (self.mode == "source_grounded") != bool(self.source_artifacts):
            raise ValueError(
                "grounding mode must match its explicitly selected artifacts"
            )
        if any(
            ref.kind
            not in {
                "research",
                "qualitative_analysis",
                "transcript_corpus",
                "simulation",
            }
            for ref in self.source_artifacts
        ):
            raise ValueError("unsupported simulation grounding artifact kind")
        return self


class SimulationSamplingV1(_FrozenCorpusModel):
    seed: _Seed
    profile_version: Literal["hash_uniform_v1"]


class SimulationRequestV1(_FrozenCorpusModel):
    """Semantic input. Explicit intent is admitted by the owning API, not a model."""

    requested: Literal[True]
    scenario: SimulationScenarioV1
    stakeholders: tuple[SimulationStakeholderV1, ...] = Field(
        min_length=1, max_length=4
    )
    grounding: SimulationGroundingRequestV1
    sampling: SimulationSamplingV1
    response_style: Literal["realistic", "optimistic", "critical", "mixed"]
    generation_profile: Literal["bounded_v1"]
    _groups = field_validator("stakeholders", mode="before")(_ordered_sequence)

    @field_validator("requested", mode="before")
    @classmethod
    def explicit_request(cls, value: Any) -> bool:
        if value is not True:
            raise ValueError("simulation requires explicit boolean request authority")
        return value

    @model_validator(mode="after")
    def bounded_request(self) -> "SimulationRequestV1":
        _unique([s.stakeholder_id for s in self.stakeholders], "stakeholder IDs")
        if (
            sum(
                len(_source_bytes(value))
                for value in (
                    self.scenario.id,
                    self.scenario.description,
                    self.scenario.target_audience,
                    self.scenario.problem,
                )
            )
            + sum(
                len(_source_bytes(s.label + s.description + (s.locality or "")))
                + sum(len(_source_bytes(q.text)) for q in s.questions)
                for s in self.stakeholders
            )
            > 64_000
        ):
            raise ValueError("simulation semantic input exceeds its UTF-8 byte budget")
        return self


class SimulationOceanV1(_FrozenCorpusModel):
    openness: _Micros
    conscientiousness: _Micros
    extraversion: _Micros
    agreeableness: _Micros
    neuroticism: _Micros


class SimulationSlotV1(_FrozenCorpusModel):
    participant_id: UUID
    stakeholder_id: _Id
    slot_index: Annotated[int, Field(strict=True, ge=1, le=3)]
    country_code: _Country | None
    locality: _Label | None
    ocean_micros: SimulationOceanV1
    _uuid = field_validator("participant_id", mode="before")(_uuid_value)
    _id = field_validator("stakeholder_id")(_identifier)
    _locality = field_validator("locality")(_text)


class SimulationParticipantV1(SimulationSlotV1):
    display_name: Annotated[
        str, StringConstraints(strict=True, min_length=3, max_length=120)
    ]
    biography: Annotated[
        str, StringConstraints(strict=True, min_length=40, max_length=2000)
    ]
    motivations: tuple[_Label, ...] = Field(min_length=2, max_length=8)
    pain_points: tuple[_Label, ...] = Field(min_length=2, max_length=8)
    communication_style: Annotated[
        str, StringConstraints(strict=True, min_length=10, max_length=1000)
    ]
    origin: Literal["synthetic"]
    _collections = field_validator("motivations", "pain_points", mode="before")(
        _ordered_sequence
    )
    _texts = field_validator("display_name", "biography", "communication_style")(_text)

    @model_validator(mode="after")
    def nonblank_assumptions(self) -> "SimulationParticipantV1":
        for value in (*self.motivations, *self.pain_points):
            _text(value)
        return self


class SimulationAnswerV1(_FrozenCorpusModel):
    question_id: _Id
    text: Annotated[str, StringConstraints(strict=True, min_length=20, max_length=4000)]
    _id = field_validator("question_id")(_identifier)
    _text = field_validator("text")(_text)


class SimulationInterviewV1(_FrozenCorpusModel):
    participant_id: UUID
    answers: tuple[SimulationAnswerV1, ...] = Field(min_length=1, max_length=6)
    _uuid = field_validator("participant_id", mode="before")(_uuid_value)
    _answers = field_validator("answers", mode="before")(_ordered_sequence)


class SimulationCandidateV1(_FrozenCorpusModel):
    participants: tuple[SimulationParticipantV1, ...] = Field(
        min_length=1, max_length=12
    )
    interviews: tuple[SimulationInterviewV1, ...] = Field(min_length=1, max_length=12)
    _arrays = field_validator("participants", "interviews", mode="before")(
        _ordered_sequence
    )


class SimulationGroundingReferenceV1(_FrozenCorpusModel):
    artifact: CorpusArtifactRefV1
    entry_kind: Literal["claim", "quote"]
    entry_id: _Sha256
    text_sha256: _Sha256


class SimulationGroundingPassageV1(SimulationGroundingReferenceV1):
    """A caller-admitted passage; text hash is identity, never access authority."""

    text: Annotated[str, StringConstraints(strict=True, min_length=1, max_length=8000)]
    _text = field_validator("text")(_text)

    @model_validator(mode="after")
    def exact_text(self) -> "SimulationGroundingPassageV1":
        if hashlib.sha256(_source_bytes(self.text)).hexdigest() != self.text_sha256:
            raise ValueError("grounding passage differs from its frozen bytes")
        return self


def _bound_uuid(kind: str, operation_id: UUID, *parts: str | int) -> UUID:
    content = {
        "namespace": "axwise.simulation.v1",
        "kind": kind,
        "operationId": str(operation_id),
        "parts": list(parts),
    }
    value = bytearray.fromhex(canonical_hash(content)[:32])
    value[6] = (value[6] & 15) | 0x50
    value[8] = (value[8] & 63) | 0x80
    return UUID(bytes=bytes(value))


def simulation_plan(
    request: SimulationRequestV1 | Mapping[str, Any], *, operation_id: UUID | str
) -> tuple[SimulationSlotV1, ...]:
    """Stable slot IDs; SHA-derived integer samples do not use global RNG state."""
    request = SimulationRequestV1.model_validate(request)
    operation_id = UUID(str(operation_id))
    slots = []
    for stakeholder in request.stakeholders:
        for index in range(1, stakeholder.participant_count + 1):
            ocean = {}
            for field in SimulationOceanV1.model_fields:
                sample = canonical_hash(
                    {
                        "profile": request.sampling.profile_version,
                        "seed": request.sampling.seed,
                        "stakeholderId": stakeholder.stakeholder_id,
                        "slotIndex": index,
                        "trait": field,
                    }
                )
                # Deliberately illustrative bounded diversity, with no demographic
                # or occupational inference and no claim of calibrated priors.
                ocean[field] = 300_000 + int(sample[:16], 16) % 400_001
            slots.append(
                SimulationSlotV1.model_validate(
                    {
                        "participantId": str(
                            _bound_uuid(
                                "participant",
                                operation_id,
                                stakeholder.stakeholder_id,
                                index,
                            )
                        ),
                        "stakeholderId": stakeholder.stakeholder_id,
                        "slotIndex": index,
                        "countryCode": stakeholder.country_code,
                        "locality": stakeholder.locality,
                        "oceanMicros": ocean,
                    }
                )
            )
    return tuple(slots)


def validate_simulation_grounding(
    request: SimulationRequestV1 | Mapping[str, Any],
    passages: list[Any] | tuple[Any, ...],
) -> tuple[SimulationGroundingPassageV1, ...]:
    """Rebind passages to selected references after caller ownership validation."""
    request = SimulationRequestV1.model_validate(request)
    raw = _ordered_sequence(passages)
    if len(raw) > MAX_SIMULATION_GROUNDING_PASSAGES:
        raise ValueError("simulation grounding passage count exceeds its bound")
    values = tuple(SimulationGroundingPassageV1.model_validate(row) for row in raw)
    if (
        sum(len(_source_bytes(row.text)) for row in values)
        > MAX_SIMULATION_GROUNDING_BYTES
    ):
        raise ValueError("simulation grounding exceeds its UTF-8 byte budget")
    expected = {str(ref.artifact_id): ref for ref in request.grounding.source_artifacts}
    used = set()
    keys = []
    for row in values:
        identity = str(row.artifact.artifact_id)
        if expected.get(identity) != row.artifact:
            raise ValueError(
                "simulation grounding differs from the selected immutable source"
            )
        keys.append((identity, row.entry_kind, row.entry_id))
        used.add(identity)
    _unique(keys, "selected grounding entries")
    if used != set(expected) or (
        request.grounding.mode == "source_grounded" and not values
    ):
        raise ValueError(
            "source-grounded simulation requires passages from every selected source"
        )
    return values


def _validate_candidate(
    candidate: SimulationCandidateV1, request: SimulationRequestV1, operation_id: UUID
) -> tuple[SimulationSlotV1, ...]:
    plan = simulation_plan(request, operation_id=operation_id)
    ids = [slot.participant_id for slot in plan]
    if [person.participant_id for person in candidate.participants] != ids:
        raise ValueError(
            "simulation participants must exactly match every planned slot in order"
        )
    if [interview.participant_id for interview in candidate.interviews] != ids:
        raise ValueError(
            "simulation requires exactly one ordered interview per planned participant"
        )
    groups = {row.stakeholder_id: row for row in request.stakeholders}
    for slot, person, interview in zip(
        plan, candidate.participants, candidate.interviews, strict=True
    ):
        actual = {
            field.alias: getattr(person, name)
            for name, field in SimulationSlotV1.model_fields.items()
        }
        if SimulationSlotV1.model_validate(actual) != slot:
            raise ValueError(
                "participant changed its assigned stakeholder, market or sampled profile"
            )
        if [answer.question_id for answer in interview.answers] != [
            q.question_id for q in groups[slot.stakeholder_id].questions
        ]:
            raise ValueError(
                "simulation must answer every requested question exactly once in order"
            )
    return plan


def _build_corpus(
    candidate: SimulationCandidateV1, request: SimulationRequestV1, operation_id: UUID
) -> TranscriptCorpusV1:
    groups = {row.stakeholder_id: row for row in request.stakeholders}
    documents = []
    for person, interview in zip(
        candidate.participants, candidate.interviews, strict=True
    ):
        group = groups[person.stakeholder_id]
        text_parts, turns, position = [], [], 0
        for question, answer in zip(group.questions, interview.answers, strict=True):
            key = canonical_hash(
                {
                    "participantId": str(person.participant_id),
                    "questionId": question.question_id,
                }
            )
            for prefix, utterance, role in (
                ("Question: ", question.text, "interviewer"),
                ("Answer: ", answer.text, str(person.participant_id)),
            ):
                text_parts.extend((prefix, utterance, "\n"))
                start = position + len(prefix.encode())
                end = start + len(_source_bytes(utterance))
                turns.append(
                    {
                        "turnId": ("question-" if role == "interviewer" else "answer-")
                        + key,
                        "participantId": role,
                        "questionId": question.question_id,
                        "start": start,
                        "end": end,
                        "offsetUnit": "utf8_bytes",
                    }
                )
                position = end + 1
        text = "".join(text_parts)
        documents.append(
            {
                "documentId": str(
                    _bound_uuid("transcript", operation_id, str(person.participant_id))
                ),
                "title": "Synthetic interview — " + person.display_name,
                "text": text,
                "textSha256": hashlib.sha256(_source_bytes(text)).hexdigest(),
                "origin": "synthetic_transcript",
                "originArtifactRefs": [],
                "participants": [
                    {
                        "participantId": "interviewer",
                        "displayName": "Simulated interviewer",
                        "role": "interviewer",
                        "stakeholderId": None,
                    },
                    {
                        "participantId": str(person.participant_id),
                        "displayName": person.display_name,
                        "role": "participant",
                        "stakeholderId": person.stakeholder_id,
                    },
                ],
                "turns": turns,
            }
        )
    return TranscriptCorpusV1.model_validate(
        {"schemaVersion": "axwise.transcript-corpus.v1", "documents": documents}
    )


class SimulationCohortV1(_FrozenCorpusModel):
    expected_participants: Annotated[int, Field(strict=True, ge=1, le=12)]
    completed_participants: Annotated[int, Field(strict=True, ge=1, le=12)]
    expected_responses: Annotated[int, Field(strict=True, ge=1, le=72)]
    completed_responses: Annotated[int, Field(strict=True, ge=1, le=72)]
    complete: Literal[True]

    @field_validator("complete", mode="before")
    @classmethod
    def literal_complete(cls, value: Any) -> bool:
        if value is not True:
            raise ValueError("completed simulation cohort requires literal true")
        return value


class SimulationGroundingResultV1(_FrozenCorpusModel):
    status: Literal["not_requested", "applied"]
    selected_references: tuple[SimulationGroundingReferenceV1, ...] = Field(
        max_length=16
    )
    _refs = field_validator("selected_references", mode="before")(_ordered_sequence)


def _limitations(mode: str) -> tuple[str, ...]:
    return (
        *_LIMITATIONS,
        (
            "No external grounding was requested or applied."
            if mode == "scenario_only"
            else "Grounding records selected source passages; it does not verify simulated responses as real-world facts."
        ),
    )


class SimulationV1(_FrozenCorpusModel):
    schema_version: Literal["axwise.simulation.v1"]
    method_version: Literal["axwise.simulate.bounded.v1"]
    origin: Literal["synthetic"]
    operation_id: UUID
    accepted_scope: CorpusArtifactRefV1
    request: SimulationRequestV1
    request_hash: _Sha256
    source_artifacts: tuple[CorpusArtifactRefV1, ...] = Field(max_length=4)
    grounding: SimulationGroundingResultV1
    sampling_reproducibility: Literal["sampling_only"]
    participants: tuple[SimulationParticipantV1, ...] = Field(
        min_length=1, max_length=12
    )
    corpus: TranscriptCorpusV1
    cohort: SimulationCohortV1
    limitations: tuple[_Label, ...] = Field(min_length=5, max_length=5)
    _uuid = field_validator("operation_id", mode="before")(_uuid_value)
    _arrays = field_validator(
        "source_artifacts", "participants", "limitations", mode="before"
    )(_ordered_sequence)

    @model_validator(mode="after")
    def exact_simulation_identity(self) -> "SimulationV1":
        if self.accepted_scope.kind != "scope":
            raise ValueError("simulation requires an accepted scope artifact")
        if self.request_hash != canonical_hash(
            self.request.model_dump(mode="json", by_alias=True)
        ):
            raise ValueError(
                "simulation request hash does not bind its exact requested scenario"
            )
        if self.source_artifacts != self.request.grounding.source_artifacts:
            raise ValueError("simulation source references differ from its request")
        if self.limitations != _limitations(self.request.grounding.mode):
            raise ValueError(
                "simulation must retain all synthetic and sampling limitations"
            )
        _check_artifact_structure(self)
        return self


def _check_artifact_structure(value: SimulationV1) -> None:
    request = value.request
    refs = {str(ref.artifact_id): ref for ref in value.source_artifacts}
    seen, used = [], set()
    for selected in value.grounding.selected_references:
        identity = str(selected.artifact.artifact_id)
        if refs.get(identity) != selected.artifact:
            raise ValueError("simulation selected grounding reference changed")
        seen.append((identity, selected.entry_kind, selected.entry_id))
        used.add(identity)
    _unique(seen, "selected grounding references")
    expected_status = (
        "applied" if request.grounding.mode == "source_grounded" else "not_requested"
    )
    if value.grounding.status != expected_status or used != set(refs):
        raise ValueError(
            "simulation grounding result must account for every selected source"
        )
    if len(value.corpus.documents) != len(value.participants):
        raise ValueError("simulation requires one frozen transcript per participant")
    groups = {group.stakeholder_id: group for group in request.stakeholders}
    interviews = []
    for person, document in zip(
        value.participants, value.corpus.documents, strict=True
    ):
        group = groups.get(person.stakeholder_id)
        if group is None or len(document.turns) != 2 * len(group.questions):
            raise ValueError(
                "simulation transcript is missing ordered question/answer turns"
            )
        answers = []
        for question, turn in zip(group.questions, document.turns[1::2], strict=True):
            answers.append(
                {
                    "questionId": question.question_id,
                    "text": _exact_utf8_span(document.text, turn.start, turn.end),
                }
            )
        interviews.append(
            {"participantId": str(person.participant_id), "answers": answers}
        )
    candidate = SimulationCandidateV1.model_validate(
        {"participants": value.participants, "interviews": interviews}
    )
    _validate_candidate(candidate, request, value.operation_id)
    expected_corpus = _build_corpus(candidate, request, value.operation_id)
    if value.corpus != expected_corpus:
        raise ValueError(
            "simulation transcript content, question, origin or identity changed"
        )
    participants = sum(group.participant_count for group in request.stakeholders)
    responses = sum(
        group.participant_count * len(group.questions) for group in request.stakeholders
    )
    expected = {
        "expectedParticipants": participants,
        "completedParticipants": participants,
        "expectedResponses": responses,
        "completedResponses": responses,
        "complete": True,
    }
    if value.cohort.model_dump(mode="json", by_alias=True) != expected:
        raise ValueError("simulation cohort must equal complete requested coverage")
    if (
        sum(
            len(
                _source_bytes(
                    person.biography
                    + person.communication_style
                    + "".join(person.motivations + person.pain_points)
                )
            )
            for person in value.participants
        )
        > 64_000
    ):
        raise ValueError("simulation persona text exceeds its aggregate byte budget")


def build_simulation(
    candidate: SimulationCandidateV1 | Mapping[str, Any],
    *,
    request: SimulationRequestV1 | Mapping[str, Any],
    operation_id: UUID | str,
    accepted_scope: CorpusArtifactRefV1 | Mapping[str, Any],
    admitted_grounding: list[Any] | tuple[Any, ...] = (),
) -> SimulationV1:
    """Publish only full candidate coverage, never a repaired/truncated subset."""
    request = SimulationRequestV1.model_validate(request)
    operation_id = UUID(str(operation_id))
    accepted_scope = CorpusArtifactRefV1.model_validate(accepted_scope)
    grounding = validate_simulation_grounding(request, admitted_grounding)
    candidate = SimulationCandidateV1.model_validate(candidate)
    _validate_candidate(candidate, request, operation_id)
    corpus = _build_corpus(candidate, request, operation_id)
    participant_count = len(candidate.participants)
    response_count = sum(len(interview.answers) for interview in candidate.interviews)
    return SimulationV1.model_validate(
        {
            "schemaVersion": "axwise.simulation.v1",
            "methodVersion": SIMULATION_METHOD,
            "origin": "synthetic",
            "operationId": str(operation_id),
            "acceptedScope": accepted_scope,
            "request": request,
            "requestHash": canonical_hash(
                request.model_dump(mode="json", by_alias=True)
            ),
            "sourceArtifacts": request.grounding.source_artifacts,
            "grounding": {
                "status": "applied" if grounding else "not_requested",
                "selectedReferences": [
                    row.model_dump(mode="json", by_alias=True, exclude={"text"})
                    for row in grounding
                ],
            },
            "samplingReproducibility": "sampling_only",
            "participants": candidate.participants,
            "corpus": corpus,
            "cohort": {
                "expectedParticipants": participant_count,
                "completedParticipants": participant_count,
                "expectedResponses": response_count,
                "completedResponses": response_count,
                "complete": True,
            },
            "limitations": _limitations(request.grounding.mode),
        }
    )


def validate_simulation(
    value: SimulationV1 | Mapping[str, Any],
    *,
    request: SimulationRequestV1 | Mapping[str, Any],
    operation_id: UUID | str,
    accepted_scope: CorpusArtifactRefV1 | Mapping[str, Any],
    admitted_grounding: list[Any] | tuple[Any, ...] = (),
) -> SimulationV1:
    """Bind an artifact to authoritative caller inputs after source admission."""
    candidate = SimulationV1.model_validate(value)
    expected_request = SimulationRequestV1.model_validate(request)
    if (
        candidate.operation_id != UUID(str(operation_id))
        or candidate.request != expected_request
    ):
        raise ValueError(
            "simulation artifact belongs to a different operation or request"
        )
    if candidate.accepted_scope != CorpusArtifactRefV1.model_validate(accepted_scope):
        raise ValueError("simulation artifact differs from the accepted caller scope")
    passages = validate_simulation_grounding(expected_request, admitted_grounding)
    selected = tuple(
        SimulationGroundingReferenceV1.model_validate(
            row.model_dump(mode="json", by_alias=True, exclude={"text"})
        )
        for row in passages
    )
    if candidate.grounding.selected_references != selected:
        raise ValueError(
            "simulation grounding differs from the caller-admitted passages"
        )
    return candidate


__all__ = [
    "MAX_SIMULATION_STAKEHOLDERS",
    "MAX_SIMULATION_PARTICIPANTS_PER_GROUP",
    "MAX_SIMULATION_QUESTIONS_PER_GROUP",
    "MAX_SIMULATION_PARTICIPANTS",
    "MAX_SIMULATION_RESPONSES",
    "MAX_SIMULATION_GROUNDING_BYTES",
    "MAX_SIMULATION_GROUNDING_PASSAGES",
    "SIMULATION_METHOD",
    "SIMULATION_SAMPLING_PROFILE",
    "SimulationQuestionV1",
    "SimulationScenarioV1",
    "SimulationStakeholderV1",
    "SimulationGroundingRequestV1",
    "SimulationSamplingV1",
    "SimulationRequestV1",
    "SimulationOceanV1",
    "SimulationSlotV1",
    "SimulationParticipantV1",
    "SimulationAnswerV1",
    "SimulationInterviewV1",
    "SimulationCandidateV1",
    "SimulationGroundingReferenceV1",
    "SimulationGroundingPassageV1",
    "SimulationCohortV1",
    "SimulationGroundingResultV1",
    "SimulationV1",
    "simulation_plan",
    "validate_simulation_grounding",
    "build_simulation",
    "validate_simulation",
]
