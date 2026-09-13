"""Frozen transcript identity is source-local, exact, bounded and origin-aware."""

from __future__ import annotations

import copy
import hashlib
import subprocess
import sys
from types import MappingProxyType
from uuid import UUID

import pytest
from pydantic import ValidationError

from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    SourceQuoteV1,
    TranscriptCorpusV1,
    TranscriptDocumentV1,
    TranscriptParticipantV1,
    TranscriptTurnV1,
    extract_source_quote,
    transcript_corpus_hash,
    validate_source_quote,
    validate_transcript_corpus,
)
from backend.domain.workflow_v2.wire import canonical_hash


pytestmark = pytest.mark.contract


def uid(number: int) -> str:
    return f"00000000-0000-4000-8000-{number:012d}"


def digest(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def participant(identity="p1", *, role="participant", name="Same display name") -> dict:
    return {
        "participantId": identity,
        "displayName": name,
        "role": role,
        "stakeholderId": None,
    }


def turn(identity, speaker, start, end, *, question=None) -> dict:
    return {
        "turnId": identity,
        "participantId": speaker,
        "questionId": question,
        "start": start,
        "end": end,
        "offsetUnit": "utf8_bytes",
    }


def document(
    text="A precise source statement.",
    *,
    number=1,
    origin="supplied_transcript",
    participants=None,
    turns=None,
) -> dict:
    return {
        "documentId": uid(number),
        "title": "Frozen source",
        "text": text,
        "textSha256": digest(text),
        "origin": origin,
        "originArtifactRefs": [],
        "participants": [participant()] if participants is None else participants,
        "turns": (
            [
                turn(
                    "t1",
                    "p1",
                    0,
                    len(text.encode("utf-8")),
                    question="q1" if origin == "synthetic_transcript" else None,
                )
            ]
            if turns is None
            else turns
        ),
    }


def corpus(*documents: dict) -> dict:
    return {
        "schemaVersion": "axwise.transcript-corpus.v1",
        "documents": list(documents or [document()]),
    }


def quote(
    value,
    *,
    document_id=None,
    turn_id="t1",
    participant_id="p1",
    start=0,
    end=None,
    **kwargs,
):
    validated = validate_transcript_corpus(value)
    selected = validated.documents[0]
    return extract_source_quote(
        validated,
        document_id=document_id or selected.document_id,
        turn_id=turn_id,
        participant_id=participant_id,
        start=start,
        end=len(selected.text.encode("utf-8")) if end is None else end,
        **kwargs,
    )


def reidentify(value: dict) -> dict:
    result = copy.deepcopy(value)
    result["quoteId"] = canonical_hash(
        {key: item for key, item in result.items() if key != "quoteId"}
    )
    return result


def test_wire_round_trip_is_frozen_and_does_not_change_source_bytes() -> None:
    text = "Interviewer: Why?\r\nParticipant: Café e\u0301 🧭.\r\n"
    split = len("Interviewer: Why?\r\n".encode("utf-8"))
    raw = corpus(
        document(
            text,
            participants=[
                participant("interviewer", role="interviewer"),
                participant(),
            ],
            turns=[
                turn("q", "interviewer", 0, split),
                turn("t1", "p1", split, len(text.encode("utf-8"))),
            ],
        )
    )
    original = copy.deepcopy(raw)
    result = TranscriptCorpusV1.model_validate(raw)
    assert result.model_dump(mode="json", by_alias=True) == raw
    assert isinstance(result.documents, tuple)
    assert isinstance(result.documents[0].participants, tuple)
    assert isinstance(result.documents[0].turns, tuple)
    assert isinstance(result.documents[0].origin_artifact_refs, tuple)
    extracted = quote(result, start=split)
    assert extracted.text == text.encode("utf-8")[split:].decode("utf-8")
    assert extracted.text_sha256 == digest(extracted.text)
    assert extracted.source_text_sha256 == digest(text)
    assert validate_source_quote(result, extracted) == extracted
    assert raw == original


@pytest.mark.parametrize(
    "target", ["corpus", "document", "participant", "turn", "quote", "reference"]
)
def test_all_source_models_are_frozen(target: str) -> None:
    result = validate_transcript_corpus(corpus())
    selected = {
        "corpus": (result, "documents", ()),
        "document": (result.documents[0], "text", "Changed"),
        "participant": (result.documents[0].participants[0], "role", "interviewer"),
        "turn": (result.documents[0].turns[0], "start", 1),
        "quote": (quote(result), "origin", "synthetic_transcript"),
        "reference": (
            CorpusArtifactRefV1.model_validate(
                {"artifactId": uid(8), "artifactHash": "a" * 64, "kind": "research"}
            ),
            "kind",
            "simulation",
        ),
    }[target]
    with pytest.raises(ValidationError, match="frozen"):
        setattr(*selected)


@pytest.mark.parametrize("target", ["corpus", "document", "participant", "turn"])
def test_unknown_fields_are_rejected_at_every_nested_level(target: str) -> None:
    raw = corpus()
    objects = {
        "corpus": raw,
        "document": raw["documents"][0],
        "participant": raw["documents"][0]["participants"][0],
        "turn": raw["documents"][0]["turns"][0],
    }
    objects[target]["verifiedHuman"] = True
    with pytest.raises(ValidationError):
        validate_transcript_corpus(raw)


@pytest.mark.parametrize(
    ("model", "raw", "camel", "snake"),
    [
        (TranscriptCorpusV1, corpus(), "schemaVersion", "schema_version"),
        (TranscriptDocumentV1, document(), "documentId", "document_id"),
        (TranscriptParticipantV1, participant(), "participantId", "participant_id"),
        (TranscriptTurnV1, turn("t1", "p1", 0, 2), "turnId", "turn_id"),
    ],
)
def test_new_wire_models_reject_snake_case_aliases(model, raw, camel, snake) -> None:
    raw = copy.deepcopy(raw)
    raw[snake] = raw.pop(camel)
    with pytest.raises(ValidationError, match="must use alias"):
        model.model_validate(raw)


@pytest.mark.parametrize("bad", [True, False, 1.0, "1", None, -1, 128001])
def test_turn_offsets_reject_coercion_and_out_of_range_values(bad) -> None:
    raw = document()
    raw["turns"][0]["start"] = bad
    with pytest.raises(ValidationError):
        TranscriptDocumentV1.model_validate(raw)


@pytest.mark.parametrize(
    "change", ["hash", "text", "unit", "unicode", "empty_turn", "beyond_text"]
)
def test_frozen_text_and_turn_boundaries_fail_closed(change: str) -> None:
    raw = document("Café 🧭.")
    if change == "hash":
        raw["textSha256"] = "0" * 64
    elif change == "text":
        raw["text"] += " Changed"
    elif change == "unit":
        raw["turns"][0]["offsetUnit"] = "utf16_code_units"
    elif change == "unicode":
        raw["turns"][0]["start"] = 4  # inside the two-byte é
    elif change == "empty_turn":
        raw["turns"][0]["end"] = 0
    else:
        raw["turns"][0]["end"] += 1
    with pytest.raises(ValidationError):
        validate_transcript_corpus(corpus(raw))


@pytest.mark.parametrize("collection", ["documents", "participants", "turns"])
def test_duplicate_ids_are_rejected_within_their_own_scope(collection: str) -> None:
    raw = corpus()
    owner = raw if collection == "documents" else raw["documents"][0]
    owner[collection].append(copy.deepcopy(owner[collection][0]))
    with pytest.raises(ValidationError):
        validate_transcript_corpus(raw)


def test_same_participant_turn_and_display_ids_across_documents_are_distinct() -> None:
    raw = corpus(document("Same words.", number=1), document("Same words.", number=2))
    first = quote(raw, document_id=uid(1))
    second = quote(raw, document_id=uid(2))
    assert first.participant_id == second.participant_id == "p1"
    assert first.turn_id == second.turn_id == "t1"
    assert first.text == second.text
    assert first.quote_id != second.quote_id
    assert first.document_id != second.document_id


@pytest.mark.parametrize("kind", ["missing_speaker", "overlap", "reordered"])
def test_turn_registry_and_order_are_not_guessed_or_repaired(kind: str) -> None:
    turns = [turn("t1", "p1", 0, 3), turn("t2", "p1", 3, 6)]
    if kind == "missing_speaker":
        turns[0]["participantId"] = "P1"
    elif kind == "overlap":
        turns[1]["start"] = 2
    else:
        turns.reverse()
    with pytest.raises(ValidationError):
        validate_transcript_corpus(corpus(document("abcdef", turns=turns)))


def test_adjacent_turns_are_valid_but_a_quote_cannot_cross_them() -> None:
    raw = corpus(
        document("abcdef", turns=[turn("t1", "p1", 0, 3), turn("t2", "p1", 3, 6)])
    )
    assert quote(raw, end=3).text == "abc"
    with pytest.raises(ValueError, match="inside its exact participant turn"):
        quote(raw, start=2, end=4)


def test_unattributed_separators_cannot_be_absorbed_into_a_quote() -> None:
    raw = corpus(
        document(
            "Yes.\n---\nNo.", turns=[turn("t1", "p1", 0, 4), turn("t2", "p1", 9, 12)]
        )
    )
    assert quote(raw, end=4).text == "Yes."
    with pytest.raises(ValueError):
        quote(raw, end=9)


def test_repeated_quote_text_needs_explicit_exact_coordinates() -> None:
    raw = corpus(
        document("Yes. Yes.", turns=[turn("t1", "p1", 0, 4), turn("t2", "p1", 5, 9)])
    )
    first = quote(raw, end=4, candidate_text="Yes.")
    second = quote(raw, turn_id="t2", start=5, end=9, candidate_text="Yes.")
    assert first.text == second.text
    assert first.quote_id != second.quote_id
    with pytest.raises(ValueError):
        quote(raw, turn_id="t1", start=5, end=9, candidate_text="Yes.")
    with pytest.raises(TypeError):
        extract_source_quote(
            raw,
            document_id=uid(1),
            turn_id="t1",
            participant_id="p1",
            candidate_text="Yes.",
        )


@pytest.mark.parametrize(
    "candidate",
    [
        "a precise source statement.",
        "A precise source statement. ",
        "Invented source statement.",
        b"A precise source statement.",
        1,
    ],
)
def test_candidate_text_is_exact_not_casefolded_trimmed_or_remapped(candidate) -> None:
    with pytest.raises(ValueError, match="candidate quote text"):
        quote(corpus(), candidate_text=candidate)


@pytest.mark.parametrize("role", ["interviewer", "author", "unknown"])
def test_nonparticipant_quote_requires_explicit_audit_and_retains_speaker_role(
    role: str,
) -> None:
    raw = corpus(document(participants=[participant(role=role)]))
    with pytest.raises(ValueError, match="participant evidence"):
        quote(raw)
    audited = quote(raw, require_participant=False)
    assert audited.speaker_role == role
    assert audited.origin == "supplied_transcript"
    assert validate_source_quote(raw, audited, require_participant=False) == audited
    with pytest.raises(ValueError, match="participant evidence"):
        validate_source_quote(raw, audited)


def test_wrong_speaker_cannot_use_another_participants_exact_text() -> None:
    raw = corpus(document(participants=[participant(), participant("p2")]))
    with pytest.raises(ValueError, match="turn and speaker"):
        quote(raw, participant_id="p2")


def test_document_context_is_not_automatically_transcript_or_participant_evidence() -> (
    None
):
    raw = corpus(document(origin="supplied_document", participants=[], turns=[]))
    with pytest.raises(ValueError, match="participant evidence"):
        quote(raw, turn_id=None, participant_id=None)
    audited = quote(raw, turn_id=None, participant_id=None, require_participant=False)
    assert audited.speaker_role is None
    assert audited.origin == "supplied_document"


@pytest.mark.parametrize("missing", ["participants", "turns"])
def test_transcript_origins_require_participants_and_turns(missing: str) -> None:
    raw = document()
    raw[missing] = []
    with pytest.raises(
        ValidationError, match="require a participant registry and turns"
    ):
        validate_transcript_corpus(corpus(raw))


def test_mixed_corpus_preserves_synthetic_origin_in_exact_quotes() -> None:
    raw = corpus(document(number=1), document(number=2, origin="synthetic_transcript"))
    first = quote(raw, document_id=uid(1))
    synthetic = quote(raw, document_id=uid(2))
    assert first.origin == "supplied_transcript"
    assert synthetic.origin == "synthetic_transcript"
    assert synthetic.speaker_role == "participant"
    assert first.quote_id != synthetic.quote_id


def test_simulation_artifact_lineage_cannot_be_relabelled_supplied() -> None:
    raw = document()
    raw["originArtifactRefs"] = [
        {"artifactId": uid(9), "artifactHash": "a" * 64, "kind": "simulation"}
    ]
    with pytest.raises(ValidationError, match="simulation lineage"):
        validate_transcript_corpus(corpus(raw))


def test_trusted_producer_origin_can_reject_but_never_relabel_sources() -> None:
    raw = corpus()
    original = copy.deepcopy(raw)
    with pytest.raises(ValueError, match="trusted producer lineage"):
        validate_transcript_corpus(
            raw, trusted_origins={uid(1): "synthetic_transcript"}
        )
    assert raw == original
    assert validate_transcript_corpus(
        raw, trusted_origins={uid(1): "supplied_transcript"}
    )


@pytest.mark.parametrize(
    "mapping",
    [
        {uid(99): "synthetic_transcript"},
        {uid(1): "verified_human"},
        {uid(1): "supplied_transcript", UUID(uid(1)): "supplied_transcript"},
    ],
)
def test_trusted_lineage_rejects_unknown_ids_origins_and_duplicate_normalized_ids(
    mapping,
) -> None:
    with pytest.raises(ValueError):
        validate_transcript_corpus(corpus(), trusted_origins=mapping)


def test_synthetic_turns_require_question_identity() -> None:
    raw = document(origin="synthetic_transcript")
    raw["turns"][0]["questionId"] = None
    with pytest.raises(ValidationError, match="question identity"):
        validate_transcript_corpus(corpus(raw))


@pytest.mark.parametrize(
    "field", ["origin", "sourceTextSha256", "documentId", "speakerRole"]
)
def test_self_consistent_forged_quote_still_must_match_the_frozen_corpus(
    field: str,
) -> None:
    raw = corpus(document(origin="synthetic_transcript"))
    result = quote(raw).model_dump(mode="json", by_alias=True)
    result[field] = {
        "origin": "supplied_transcript",
        "sourceTextSha256": "a" * 64,
        "documentId": uid(99),
        "speakerRole": "interviewer",
    }[field]
    forged = SourceQuoteV1.model_validate(reidentify(result))
    with pytest.raises(ValueError):
        validate_source_quote(raw, forged, require_participant=False)


@pytest.mark.parametrize(
    "field", ["quoteId", "textSha256", "text", "start", "offsetUnit"]
)
def test_quote_self_consistency_rejects_tampering(field: str) -> None:
    value = quote(corpus()).model_dump(mode="json", by_alias=True)
    value[field] = {
        "quoteId": "0" * 64,
        "textSha256": "0" * 64,
        "text": "Altered",
        "start": 1,
        "offsetUnit": "code_points",
    }[field]
    with pytest.raises(ValidationError):
        SourceQuoteV1.model_validate(value)


def test_model_copy_does_not_bypass_boundary_revalidation() -> None:
    validated = validate_transcript_corpus(corpus())
    changed_document = validated.documents[0].model_copy(update={"text": "Modified"})
    forged = validated.model_copy(update={"documents": (changed_document,)})
    with pytest.raises(ValidationError, match="hash"):
        quote(forged)


def test_valid_prebuilt_models_revalidate_without_weakening_wire_alias_rules() -> None:
    validated = validate_transcript_corpus(corpus())
    assert TranscriptCorpusV1.model_validate(validated) == validated
    assert (
        TranscriptCorpusV1.model_validate(
            {
                "schemaVersion": "axwise.transcript-corpus.v1",
                "documents": validated.documents,
            }
        )
        == validated
    )
    assert (
        TranscriptDocumentV1.model_validate(validated.documents[0])
        == validated.documents[0]
    )
    source_quote = quote(validated)
    assert SourceQuoteV1.model_validate(source_quote) == source_quote


@pytest.mark.parametrize("target", ["participant", "turn", "document"])
@pytest.mark.parametrize("construction", ["copy", "construct"])
def test_nested_forged_instances_are_revalidated(
    target: str, construction: str
) -> None:
    validated = validate_transcript_corpus(corpus())
    selected = validated.documents[0]
    original = {
        "participant": selected.participants[0],
        "turn": selected.turns[0],
        "document": selected,
    }[target]
    changed = {
        "participant": {"role": "verified_customer"},
        "turn": {"start": True},
        "document": {"text_sha256": "0" * 64},
    }[target]
    forged = (
        original.model_copy(update=changed)
        if construction == "copy"
        else type(original).model_construct(**{**original.__dict__, **changed})
    )
    if target == "participant":
        selected = selected.model_copy(update={"participants": (forged,)})
    elif target == "turn":
        selected = selected.model_copy(update={"turns": (forged,)})
    else:
        selected = forged
    wrapped = TranscriptCorpusV1.model_construct(
        schema_version="axwise.transcript-corpus.v1", documents=(selected,)
    )
    with pytest.raises(ValidationError):
        TranscriptCorpusV1.model_validate(wrapped)
    with pytest.raises(ValidationError):
        quote(wrapped)
    with pytest.raises(ValidationError):
        transcript_corpus_hash(wrapped)


def test_constructed_collection_cannot_bypass_caps_or_iterate_a_generator() -> None:
    selected = validate_transcript_corpus(corpus()).documents[0]
    too_many = TranscriptCorpusV1.model_construct(
        schema_version="axwise.transcript-corpus.v1", documents=(selected,) * 17
    )
    with pytest.raises(ValidationError):
        validate_transcript_corpus(too_many)

    def forbidden_generator():
        raise AssertionError("an untrusted generator must not be consumed")
        yield selected

    forged = TranscriptCorpusV1.model_construct(
        schema_version="axwise.transcript-corpus.v1", documents=forbidden_generator()
    )
    with pytest.raises(ValidationError, match="ordered arrays"):
        validate_transcript_corpus(forged)


@pytest.mark.parametrize("construction", ["copy", "construct"])
def test_forged_prebuilt_quote_cannot_bypass_provenance_validation(
    construction: str,
) -> None:
    raw = corpus(document(origin="synthetic_transcript"))
    original = quote(raw)
    changed = {"origin": "supplied_transcript", "speaker_role": "interviewer"}
    forged = (
        original.model_copy(update=changed)
        if construction == "copy"
        else SourceQuoteV1.model_construct(**{**original.__dict__, **changed})
    )
    with pytest.raises(ValidationError, match="quote identity"):
        validate_source_quote(raw, forged, require_participant=False)


def test_constructed_missing_required_source_fields_are_not_silently_filled() -> None:
    forged = TranscriptCorpusV1.model_construct(documents=())
    with pytest.raises(ValidationError):
        validate_transcript_corpus(forged)


def test_quote_identity_has_a_stable_canonical_v1_vector() -> None:
    result = quote(corpus(document("Hello.")))
    assert (
        result.quote_id
        == "86d031d5ec6b7e512c7f18ec53b1a1574dd6fe992b4d8a4b0e9a20fd5d8138aa"
    )


@pytest.mark.parametrize(
    ("text", "start", "end"), [("é", 1, 2), ("🧭", 0, 3), ("🧭", 1, 4)]
)
def test_quote_offsets_cannot_split_multibyte_characters(text, start, end) -> None:
    with pytest.raises(ValueError, match="UTF-8 code point"):
        quote(corpus(document(text)), start=start, end=end)


def test_combining_characters_are_not_normalized() -> None:
    raw = corpus(document("e\u0301"))
    assert quote(raw).text == "e\u0301"
    assert quote(raw).text_sha256 != digest("é")
    assert (
        quote(raw, start=1, end=3).text == "\u0301"
    )  # code-point boundary, not a grapheme promise


def test_whitespace_only_quote_is_not_evidence() -> None:
    with pytest.raises(ValidationError, match="nonblank"):
        quote(corpus(document("a  b")), start=1, end=3)


@pytest.mark.parametrize("text", ["\ud800", "a\udfff"])
def test_unpaired_surrogate_source_is_rejected(text: str) -> None:
    raw = document()
    raw["text"] = text
    with pytest.raises(ValidationError):
        validate_transcript_corpus(corpus(raw))


def test_document_limit_is_exact_and_never_truncates() -> None:
    accepted = corpus(*(document("x", number=index + 1) for index in range(16)))
    assert len(validate_transcript_corpus(accepted).documents) == 16
    rejected = copy.deepcopy(accepted)
    rejected["documents"].append(document("x", number=17))
    with pytest.raises(ValidationError):
        validate_transcript_corpus(rejected)
    assert len(rejected["documents"]) == 17


def test_participant_limit_is_aggregate_not_per_document() -> None:
    first = document(
        "x",
        number=1,
        participants=[participant(f"p{i}") for i in range(16)],
        turns=[turn("t1", "p0", 0, 1)],
    )
    second = document(
        "x",
        number=2,
        participants=[participant(f"p{i}") for i in range(16)],
        turns=[turn("t1", "p0", 0, 1)],
    )
    assert (
        sum(
            len(item.participants)
            for item in validate_transcript_corpus(corpus(first, second)).documents
        )
        == 32
    )
    second["participants"].append(participant("extra"))
    with pytest.raises(ValidationError, match="aggregate participant limit"):
        validate_transcript_corpus(corpus(first, second))


def test_turn_limit_is_aggregate_and_boundary_is_inclusive() -> None:
    first = document(
        "x" * 128, number=1, turns=[turn(f"t{i}", "p1", i, i + 1) for i in range(128)]
    )
    second = document(
        "x" * 129, number=2, turns=[turn(f"t{i}", "p1", i, i + 1) for i in range(128)]
    )
    assert (
        sum(
            len(item.turns)
            for item in validate_transcript_corpus(corpus(first, second)).documents
        )
        == 256
    )
    second["turns"].append(turn("extra", "p1", 128, 129))
    with pytest.raises(ValidationError, match="aggregate turn limit"):
        validate_transcript_corpus(corpus(first, second))


def test_utf8_byte_limit_is_exact_and_not_a_character_count() -> None:
    text = "é" * 64_000
    assert (
        len(
            validate_transcript_corpus(corpus(document(text)))
            .documents[0]
            .text.encode("utf-8")
        )
        == 128_000
    )
    with pytest.raises(ValidationError):
        validate_transcript_corpus(corpus(document(text + "x")))


def test_text_byte_limit_is_aggregate_across_documents() -> None:
    first = document("a" * 64_000, number=1)
    second = document("b" * 64_000, number=2)
    assert len(validate_transcript_corpus(corpus(first, second)).documents) == 2
    with pytest.raises(ValidationError, match="aggregate UTF-8"):
        validate_transcript_corpus(corpus(first, document("b" * 64_001, number=2)))


@pytest.mark.parametrize(
    "collection", ["documents", "participants", "turns", "originArtifactRefs"]
)
def test_unordered_or_generator_collections_are_rejected(collection: str) -> None:
    raw = corpus()
    owner = raw if collection == "documents" else raw["documents"][0]
    owner[collection] = iter(owner[collection])
    with pytest.raises(ValidationError, match="ordered arrays"):
        validate_transcript_corpus(raw)


def test_corpus_hash_changes_with_text_origin_speaker_and_question_bindings() -> None:
    raw = corpus(document(origin="synthetic_transcript"))
    baseline = transcript_corpus_hash(raw)
    variants = []
    changed = copy.deepcopy(raw)
    changed["documents"][0]["origin"] = "supplied_transcript"
    variants.append(changed)
    changed = copy.deepcopy(raw)
    changed["documents"][0]["participants"][0]["role"] = "interviewer"
    variants.append(changed)
    changed = copy.deepcopy(raw)
    changed["documents"][0]["turns"][0]["questionId"] = "q2"
    variants.append(changed)
    changed = copy.deepcopy(raw)
    changed["documents"][0]["text"] = "B precise source statement."
    changed["documents"][0]["textSha256"] = digest(changed["documents"][0]["text"])
    variants.append(changed)
    assert all(transcript_corpus_hash(value) != baseline for value in variants)
    assert transcript_corpus_hash(validate_transcript_corpus(raw)) == baseline


def test_import_does_not_load_operations_legacy_processing_or_provider_packages() -> (
    None
):
    code = "import sys; import backend.domain.workflow_v2.transcript_corpus; forbidden = [name for name in sys.modules if name.startswith(('backend.services', 'backend.api', 'google', 'pydantic_ai', 'sqlalchemy'))]; assert not forbidden, forbidden; assert 'backend.domain.workflow_v2.contracts' not in sys.modules"
    result = subprocess.run(
        [sys.executable, "-c", code], check=False, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


def test_mapping_wrappers_cannot_bypass_strict_wire_aliases() -> None:
    raw = corpus()
    assert validate_transcript_corpus(MappingProxyType(raw))
    raw["schema_version"] = raw.pop("schemaVersion")
    with pytest.raises(ValidationError, match="must use alias"):
        validate_transcript_corpus(MappingProxyType(raw))


@pytest.mark.parametrize(
    "lineage", [[], {uid(1): []}, {uid(1): {"origin": "synthetic_transcript"}}]
)
def test_malformed_trusted_lineage_has_a_bounded_validation_failure(lineage) -> None:
    with pytest.raises(ValueError):
        validate_transcript_corpus(corpus(), trusted_origins=lineage)
