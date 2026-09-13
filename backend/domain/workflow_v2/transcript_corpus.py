"""Frozen source corpora and exact quotes, independent of execution and providers.

Hashes establish byte identity, never source access or human authenticity.
``supplied_transcript`` describes acquisition, not verified human testimony.
Callers must resolve artifact ownership and trusted producer lineage before
admission. Synthetic origin and non-participant speakers survive every quote.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from backend.domain.workflow_v2.wire import StrictWireContractModel, canonical_hash


MAX_CORPUS_DOCUMENTS = 16
MAX_CORPUS_PARTICIPANTS = 32
MAX_CORPUS_TURNS = 256
MAX_CORPUS_TEXT_BYTES = 128_000
MAX_DOCUMENT_ORIGIN_REFS = 16

CorpusOrigin = Literal[
    "supplied_transcript", "supplied_document", "synthetic_transcript"
]
ParticipantRole = Literal["participant", "interviewer", "author", "unknown"]
_Sha256 = Annotated[
    str,
    StringConstraints(
        strict=True, min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$"
    ),
]
_Id = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=120)]
_Text500 = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=500)]
_SourceText = Annotated[
    str, StringConstraints(strict=True, min_length=1, max_length=MAX_CORPUS_TEXT_BYTES)
]
_Offset = Annotated[int, Field(strict=True, ge=0, le=MAX_CORPUS_TEXT_BYTES)]


def _source_bytes(text: str) -> bytes:
    try:
        return text.encode("utf-8")
    except UnicodeEncodeError as error:
        raise ValueError("source text contains an unpaired surrogate") from error


def _sha256(text: str) -> str:
    return hashlib.sha256(_source_bytes(text)).hexdigest()


def _identifier(value: str | None) -> str | None:
    if value is not None:
        _source_bytes(value)
    if value is not None and (
        not value.strip()
        or value != value.strip()
        or any(ord(character) < 32 or ord(character) == 127 for character in value)
    ):
        raise ValueError("source identifiers must be nonblank exact bounded strings")
    return value


def _uuid_value(value: Any) -> Any:
    if not isinstance(value, (str, UUID)):
        raise ValueError("source UUID must be a UUID string or UUID value")
    return value


def _ordered_sequence(value: Any) -> tuple[Any, ...]:
    if not isinstance(value, (list, tuple)):
        raise ValueError("corpus collections must be ordered arrays")
    return tuple(value)


def _exact_utf8_span(text: str, start: int, end: int) -> str:
    data = _source_bytes(text)
    if (
        type(start) is not int
        or type(end) is not int
        or not 0 <= start < end <= len(data)
    ):
        raise ValueError("source span must have ordered in-range integer byte offsets")
    try:
        data[:start].decode("utf-8")
        return data[start:end].decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError("source span splits a UTF-8 code point") from error


class _FrozenCorpusModel(StrictWireContractModel):
    model_config = ConfigDict(frozen=True, revalidate_instances="always")

    @model_validator(mode="wrap")
    @classmethod
    def revalidate_stored_fields(cls, value: Any, handler: Any) -> Any:
        if isinstance(value, cls):
            # model_construct/model_copy can bypass validation despite frozen.
            # Re-enter through aliases without serializing nested unbounded or
            # malformed objects first. Nested models apply this same boundary.
            fields = cls.model_fields
            payload = {
                (fields[name].alias or name) if name in fields else name: item
                for name, item in value.__dict__.items()
            }
            if value.model_extra:
                payload.update(value.model_extra)
            value = payload
        elif isinstance(value, Mapping) and not isinstance(value, dict):
            value = dict(value)
        return handler(value)


class CorpusArtifactRefV1(_FrozenCorpusModel):
    """ArtifactRef-compatible wire shape, with no contracts-module dependency."""

    artifact_id: UUID
    artifact_hash: _Sha256
    kind: _Id

    _uuid = field_validator("artifact_id", mode="before")(_uuid_value)
    _kind = field_validator("kind")(_identifier)


class TranscriptParticipantV1(_FrozenCorpusModel):
    participant_id: _Id
    display_name: _Text500 | None
    role: ParticipantRole
    stakeholder_id: _Id | None

    _ids = field_validator("participant_id", "stakeholder_id")(_identifier)

    @field_validator("display_name")
    @classmethod
    def nonblank_display_name(cls, value: str | None) -> str | None:
        if value is not None:
            _source_bytes(value)
        if value is not None and not value.strip():
            raise ValueError("participant display name cannot be blank")
        return value


class TranscriptTurnV1(_FrozenCorpusModel):
    turn_id: _Id
    participant_id: _Id
    question_id: _Id | None
    start: _Offset
    end: _Offset
    offset_unit: Literal["utf8_bytes"]

    _ids = field_validator("turn_id", "participant_id", "question_id")(_identifier)

    @model_validator(mode="after")
    def ordered_span(self) -> "TranscriptTurnV1":
        if self.end <= self.start:
            raise ValueError("turn end must be greater than its start")
        return self


class TranscriptDocumentV1(_FrozenCorpusModel):
    document_id: UUID
    title: _Text500
    text: _SourceText
    text_sha256: _Sha256
    origin: CorpusOrigin
    origin_artifact_refs: tuple[CorpusArtifactRefV1, ...] = Field(
        max_length=MAX_DOCUMENT_ORIGIN_REFS
    )
    participants: tuple[TranscriptParticipantV1, ...] = Field(
        max_length=MAX_CORPUS_PARTICIPANTS
    )
    turns: tuple[TranscriptTurnV1, ...] = Field(max_length=MAX_CORPUS_TURNS)

    _uuid = field_validator("document_id", mode="before")(_uuid_value)
    _collections = field_validator(
        "origin_artifact_refs", "participants", "turns", mode="before"
    )(_ordered_sequence)

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value: str) -> str:
        _source_bytes(value)
        if not value.strip():
            raise ValueError("document title cannot be blank")
        return value

    @model_validator(mode="after")
    def frozen_source_bindings(self) -> "TranscriptDocumentV1":
        data = _source_bytes(self.text)
        if len(data) > MAX_CORPUS_TEXT_BYTES:
            raise ValueError("document text exceeds the corpus UTF-8 byte limit")
        if hashlib.sha256(data).hexdigest() != self.text_sha256:
            raise ValueError("document text hash does not match its frozen source")
        artifact_ids = [
            reference.artifact_id for reference in self.origin_artifact_refs
        ]
        if len(artifact_ids) != len(set(artifact_ids)):
            raise ValueError("document origin artifact IDs must be unique")
        if (
            any(
                reference.kind == "simulation"
                for reference in self.origin_artifact_refs
            )
            and self.origin != "synthetic_transcript"
        ):
            raise ValueError(
                "simulation lineage cannot be relabelled as supplied origin"
            )
        participant_ids = [
            participant.participant_id for participant in self.participants
        ]
        if len(participant_ids) != len(set(participant_ids)):
            raise ValueError("participant IDs must be unique within their document")
        turn_ids = [turn.turn_id for turn in self.turns]
        if len(turn_ids) != len(set(turn_ids)):
            raise ValueError("turn IDs must be unique within their document")
        if self.origin != "supplied_document" and (
            not self.participants or not self.turns
        ):
            raise ValueError(
                "transcript documents require a participant registry and turns"
            )
        previous_end = 0
        for turn in self.turns:
            if turn.participant_id not in participant_ids:
                raise ValueError("turn speaker is absent from this document's registry")
            if turn.start < previous_end:
                raise ValueError("document turns must be ordered and nonoverlapping")
            _exact_utf8_span(self.text, turn.start, turn.end)
            if self.origin == "synthetic_transcript" and turn.question_id is None:
                raise ValueError("synthetic transcript turns require question identity")
            previous_end = turn.end
        return self


class TranscriptCorpusV1(_FrozenCorpusModel):
    schema_version: Literal["axwise.transcript-corpus.v1"]
    documents: tuple[TranscriptDocumentV1, ...] = Field(
        min_length=1, max_length=MAX_CORPUS_DOCUMENTS
    )

    _documents = field_validator("documents", mode="before")(_ordered_sequence)

    @model_validator(mode="after")
    def aggregate_limits(self) -> "TranscriptCorpusV1":
        ids = [document.document_id for document in self.documents]
        if len(ids) != len(set(ids)):
            raise ValueError("corpus document IDs must be unique")
        if (
            sum(len(document.participants) for document in self.documents)
            > MAX_CORPUS_PARTICIPANTS
        ):
            raise ValueError("corpus exceeds its aggregate participant limit")
        if sum(len(document.turns) for document in self.documents) > MAX_CORPUS_TURNS:
            raise ValueError("corpus exceeds its aggregate turn limit")
        if (
            sum(len(_source_bytes(document.text)) for document in self.documents)
            > MAX_CORPUS_TEXT_BYTES
        ):
            raise ValueError("corpus exceeds its aggregate UTF-8 text byte limit")
        return self


class SourceQuoteV1(_FrozenCorpusModel):
    """Self-consistent quote; source admission additionally requires its corpus."""

    quote_id: _Sha256
    document_id: UUID
    turn_id: _Id | None
    participant_id: _Id | None
    speaker_role: ParticipantRole | None
    origin: CorpusOrigin
    source_text_sha256: _Sha256
    start: _Offset
    end: _Offset
    offset_unit: Literal["utf8_bytes"]
    text: _SourceText
    text_sha256: _Sha256

    _uuid = field_validator("document_id", mode="before")(_uuid_value)
    _ids = field_validator("turn_id", "participant_id")(_identifier)

    @model_validator(mode="after")
    def exact_quote_identity(self) -> "SourceQuoteV1":
        bound = self.turn_id is not None
        if bound != (self.participant_id is not None) or bound != (
            self.speaker_role is not None
        ):
            raise ValueError(
                "quote turn, participant and speaker role must bind together"
            )
        if not bound and self.origin != "supplied_document":
            raise ValueError("transcript quotes require a turn and participant binding")
        data = _source_bytes(self.text)
        if self.end - self.start != len(data) or not self.text.strip():
            raise ValueError("quote offsets must cover exactly its nonblank UTF-8 text")
        if hashlib.sha256(data).hexdigest() != self.text_sha256:
            raise ValueError("quote text hash does not match its exact bytes")
        payload = self.model_dump(mode="json", by_alias=True, exclude={"quote_id"})
        if canonical_hash(payload) != self.quote_id:
            raise ValueError("quote identity does not match its full source binding")
        return self


def validate_transcript_corpus(
    value: TranscriptCorpusV1 | Mapping[str, Any],
    *,
    trusted_origins: Mapping[UUID | str, CorpusOrigin] | None = None,
) -> TranscriptCorpusV1:
    """Revalidate the frozen value; trusted producer origins may only constrain it.

    No label is inferred from prose, and no source is relabelled to make it pass.
    Source-access checks belong to the caller, not this pure hash validator.
    """
    corpus = TranscriptCorpusV1.model_validate(value)
    if trusted_origins is not None:
        if not isinstance(trusted_origins, Mapping):
            raise ValueError("trusted producer origins must be an explicit mapping")
        origins: dict[UUID, CorpusOrigin] = {}
        for document_id, origin in trusted_origins.items():
            identity = UUID(str(document_id))
            if not isinstance(origin, str) or origin not in {
                "supplied_transcript",
                "supplied_document",
                "synthetic_transcript",
            }:
                raise ValueError("trusted producer origin is unsupported")
            if identity in origins:
                raise ValueError("trusted producer document IDs must be unique")
            origins[identity] = origin
        documents = {document.document_id: document for document in corpus.documents}
        if not set(origins) <= set(documents):
            raise ValueError("trusted producer origin names an absent document")
        if any(
            documents[identity].origin != origin for identity, origin in origins.items()
        ):
            raise ValueError("document origin conflicts with trusted producer lineage")
    return corpus


def transcript_corpus_hash(corpus: TranscriptCorpusV1 | Mapping[str, Any]) -> str:
    validated = validate_transcript_corpus(corpus)
    return canonical_hash(validated.model_dump(mode="json", by_alias=True))


def extract_source_quote(
    corpus: TranscriptCorpusV1 | Mapping[str, Any],
    *,
    document_id: UUID | str,
    turn_id: str | None,
    participant_id: str | None,
    start: int,
    end: int,
    candidate_text: str | None = None,
    require_participant: bool = True,
) -> SourceQuoteV1:
    """Construct a quote only from explicit source coordinates, never text search.

    The default admits participant statements, including explicitly synthetic
    ones; it does not verify human testimony. ``require_participant=False`` is
    an audit-only path and retains interviewer/author/unknown provenance.
    """
    validated = validate_transcript_corpus(corpus)
    identity = UUID(str(document_id))
    document = next(
        (item for item in validated.documents if item.document_id == identity), None
    )
    if document is None:
        raise ValueError("quote document is absent from the corpus")
    role: ParticipantRole | None = None
    if turn_id is None:
        if participant_id is not None or document.origin != "supplied_document":
            raise ValueError(
                "unbound quotes are allowed only for document source context"
            )
    else:
        turn = next((item for item in document.turns if item.turn_id == turn_id), None)
        if turn is None or turn.participant_id != participant_id:
            raise ValueError("quote turn and speaker do not bind to this document")
        if (
            type(start) is not int
            or type(end) is not int
            or not turn.start <= start < end <= turn.end
        ):
            raise ValueError("quote must stay inside its exact participant turn")
        role = next(
            item.role
            for item in document.participants
            if item.participant_id == participant_id
        )
    if type(require_participant) is not bool:
        raise ValueError("participant evidence policy must be explicit")
    if require_participant and (
        role != "participant" or document.origin == "supplied_document"
    ):
        raise ValueError(
            "participant evidence cannot use interviewer, author or unknown speech"
        )
    text = _exact_utf8_span(document.text, start, end)
    if candidate_text is not None and (
        type(candidate_text) is not str or candidate_text != text
    ):
        raise ValueError("candidate quote text does not match the explicit source span")
    payload = {
        "documentId": str(document.document_id),
        "turnId": turn_id,
        "participantId": participant_id,
        "speakerRole": role,
        "origin": document.origin,
        "sourceTextSha256": document.text_sha256,
        "start": start,
        "end": end,
        "offsetUnit": "utf8_bytes",
        "text": text,
        "textSha256": _sha256(text),
    }
    return SourceQuoteV1.model_validate({"quoteId": canonical_hash(payload), **payload})


def validate_source_quote(
    corpus: TranscriptCorpusV1 | Mapping[str, Any],
    quote: SourceQuoteV1 | Mapping[str, Any],
    *,
    require_participant: bool = True,
) -> SourceQuoteV1:
    """Reject forged, stale, wrong-speaker or origin-upgraded quote bindings."""
    candidate = SourceQuoteV1.model_validate(quote)
    expected = extract_source_quote(
        corpus,
        document_id=candidate.document_id,
        turn_id=candidate.turn_id,
        participant_id=candidate.participant_id,
        start=candidate.start,
        end=candidate.end,
        candidate_text=candidate.text,
        require_participant=require_participant,
    )
    if expected != candidate:
        raise ValueError("quote provenance does not match the frozen corpus")
    return expected


__all__ = [
    "MAX_CORPUS_DOCUMENTS",
    "MAX_CORPUS_PARTICIPANTS",
    "MAX_CORPUS_TURNS",
    "MAX_CORPUS_TEXT_BYTES",
    "MAX_DOCUMENT_ORIGIN_REFS",
    "CorpusOrigin",
    "ParticipantRole",
    "CorpusArtifactRefV1",
    "TranscriptParticipantV1",
    "TranscriptTurnV1",
    "TranscriptDocumentV1",
    "TranscriptCorpusV1",
    "SourceQuoteV1",
    "validate_transcript_corpus",
    "transcript_corpus_hash",
    "extract_source_quote",
    "validate_source_quote",
]
