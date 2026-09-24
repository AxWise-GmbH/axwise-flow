"""Additive capability wire identities and unchanged historical contracts."""

from __future__ import annotations

import copy
import hashlib
import json
import socket
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import TypeAdapter
from starlette.requests import Request

from backend.api.workflow_v2_app import capability_validation_error
from backend.domain.workflow_v2 import contracts
from backend.domain.workflow_v2.capability_limits import (
    CapabilityLimitsV1,
    effective_capability_limits,
)
from backend.domain.workflow_v2.contracts import (
    AdmitTranscriptCorpusInputV1,
    AnalyzeEvidenceInputV1,
    AxWiseOperationEnvelope,
    CompletionResult,
    TranscriptCorpusAdmittedResult,
    TranscriptCorpusArtifactFact,
    artifact_content_hash,
    canonical_hash,
)
from backend.domain.workflow_v2.transcript_corpus import transcript_corpus_hash
from backend.services.workflow_v2.operation_store import _stored_envelope_payload
from backend.tests.workflow_v2.analysis_test_support import (
    admission_input,
    analysis_input,
    corpus,
    corpus_fact,
    document,
    envelope,
    limits,
    ref,
    request,
    uid,
)


pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("analysis contract tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


@pytest.mark.asyncio
async def test_assistant_v2_validation_errors_do_not_echo_capability_input():
    error = SimpleNamespace(
        body={
            "operationType": "AssistantTurnV2",
            "input": {
                "type": "AssistantTurnV2",
                "message": "sensitive prompt",
                "capability": {"kind": "image_edit", "data": "sensitive bytes"},
            },
        }
    )

    http_request = Request(
        {
            "type": "http",
            "method": "POST",
            "scheme": "https",
            "server": ("testserver", 443),
            "path": "/v2/operations",
            "query_string": b"",
            "headers": [],
        }
    )
    response = await capability_validation_error(http_request, error)  # type: ignore[arg-type]

    assert response.status_code == 422
    payload = json.loads(response.body)
    assert payload == {
        "detail": [
            {
                "loc": ["body"],
                "msg": "Invalid bounded capability operation input",
                "type": "value_error.capability_input",
            }
        ]
    }
    assert b"sensitive" not in response.body


@pytest.mark.parametrize("make_input", [admission_input, analysis_input])
def test_capability_wire_round_trip_and_stored_input_hash_are_exact(make_input):
    value = envelope(make_input())
    dumped = value.model_dump(mode="json", by_alias=True)
    assert dumped["canonicalInputHash"] == canonical_hash(dumped["input"])
    assert _stored_envelope_payload(value) == dumped
    assert AxWiseOperationEnvelope.model_validate(dumped) == value
    assert "executionAgent" not in dumped["input"]


@pytest.mark.parametrize("make_input", [admission_input, analysis_input])
@pytest.mark.parametrize("field", ["operationType", "canonicalInputHash"])
def test_operation_envelope_does_not_accept_relabelled_type_or_hash(make_input, field):
    raw = envelope(make_input()).model_dump(mode="json", by_alias=True)
    raw[field] = "AssistantTurnV1" if field == "operationType" else "0" * 64
    with pytest.raises(ValueError):
        AxWiseOperationEnvelope.model_validate(raw)


@pytest.mark.parametrize(
    "field", ["deadlineMs", "maxModelCalls", "maxInputTokens", "maxOutputTokens"]
)
@pytest.mark.parametrize("bad", [0, -1, True, "1", 1.0, None])
def test_limits_are_positive_strict_integers(field, bad):
    with pytest.raises(ValueError):
        CapabilityLimitsV1.model_validate(limits(**{field: bad}))


def test_effective_limits_intersect_request_and_policy_without_mutation():
    requested = CapabilityLimitsV1.model_validate(
        limits(
            deadlineMs=1, maxModelCalls=32, maxInputTokens=2_000_000, maxOutputTokens=2
        )
    )
    policy = CapabilityLimitsV1.model_validate(limits())
    result = effective_capability_limits(requested, policy)
    assert result.model_dump(mode="json", by_alias=True) == limits(
        deadlineMs=1, maxOutputTokens=2
    )
    assert requested.max_model_calls == 32
    with pytest.raises(ValueError):
        result.deadline_ms = 2


@pytest.mark.parametrize(
    "name,maximum",
    [
        ("deadlineMs", 900_000),
        ("maxModelCalls", 32),
        ("maxInputTokens", 2_000_000),
        ("maxOutputTokens", 2_000_000),
    ],
)
def test_limit_maximum_is_bounded(name, maximum):
    with pytest.raises(ValueError):
        CapabilityLimitsV1.model_validate(limits(**{name: maximum + 1}))


@pytest.mark.parametrize(
    "field,bad",
    [
        ("decisionQuestion", ""),
        ("outputs", ["themes"]),
        ("analysisProfile", "future_v2"),
    ],
)
def test_analysis_requires_a_decision_and_current_profile(field, bad):
    raw = analysis_input()
    raw["request"][field] = bad
    with pytest.raises(ValueError):
        AnalyzeEvidenceInputV1.model_validate(raw)


@pytest.mark.parametrize(
    "change",
    [
        "missing_source",
        "hash_only",
        "source_kind",
        "scope_kind",
        "source_hash",
        "source_text",
        "unknown_field",
        "snake_case",
    ],
)
def test_new_inputs_reject_unsupported_or_inexact_sources(change):
    raw = analysis_input()
    if change == "missing_source":
        raw.pop("source")
    elif change == "hash_only":
        raw["source"] = raw["source"]["artifact"]["artifactHash"]
    elif change == "source_kind":
        raw["source"]["artifact"]["kind"] = "simulation"
    elif change == "scope_kind":
        raw["acceptedScope"]["kind"] = "research"
    elif change == "source_hash":
        raw["source"]["artifact"]["artifactHash"] = "0" * 64
    elif change == "source_text":
        raw["source"]["payload"]["documents"][0]["text"] += " fabricated"
    elif change == "unknown_field":
        raw["confidence"] = 100
    else:
        raw["accepted_scope"] = raw.pop("acceptedScope")
    with pytest.raises(ValueError):
        AnalyzeEvidenceInputV1.model_validate(raw)


def test_document_only_material_can_be_frozen_but_is_not_an_analysis_operation():
    raw = corpus(document(origin="supplied_document"))
    raw["documents"][0]["turns"] = []
    admitted = AdmitTranscriptCorpusInputV1.model_validate(admission_input(raw))
    assert admitted.corpus.documents[0].origin == "supplied_document"
    value = analysis_input()
    fact = corpus_fact(raw)
    value["source"] = {
        "artifact": ref(fact),
        "contentType": "application/json",
        "payload": fact.payload,
        "markdown": None,
    }
    with pytest.raises(ValueError, match="document-only"):
        AnalyzeEvidenceInputV1.model_validate(value)


def test_admission_rejects_conflicting_and_aggregate_unbounded_parent_references():
    docs = [document(number=index + 1) for index in range(2)]
    for index, doc in enumerate(docs):
        doc["originArtifactRefs"] = [
            {
                "artifactId": uid(200 + index * 9 + item),
                "artifactHash": "a" * 64,
                "kind": "transcript_corpus",
            }
            for item in range(9)
        ]
    with pytest.raises(ValueError, match="aggregate origin-artifact"):
        AdmitTranscriptCorpusInputV1.model_validate(
            {
                "type": "AdmitTranscriptCorpusV1",
                "corpus": corpus(*docs),
                "admissionProfile": "supplied_transcript_v1",
            }
        )
    docs[1]["originArtifactRefs"] = [
        {**docs[0]["originArtifactRefs"][0], "artifactHash": "b" * 64}
    ]
    with pytest.raises(ValueError, match="identity cannot conflict"):
        AdmitTranscriptCorpusInputV1.model_validate(
            {
                "type": "AdmitTranscriptCorpusV1",
                "corpus": corpus(*docs),
                "admissionProfile": "supplied_transcript_v1",
            }
        )


def test_corpus_hash_and_artifact_content_hash_are_distinct_and_not_interchangeable():
    fact = corpus_fact()
    assert fact.artifact_hash != transcript_corpus_hash(fact.payload)
    raw = fact.model_dump(mode="json", by_alias=True)
    raw["artifactHash"] = transcript_corpus_hash(fact.payload)
    with pytest.raises(ValueError):
        TranscriptCorpusArtifactFact.model_validate(raw)


def test_admitted_completion_is_typed_json_and_lineage_must_be_exact():
    fact = corpus_fact()
    completion = TranscriptCorpusAdmittedResult(
        result_type="transcript_corpus_admitted", artifact=fact
    )
    assert (
        TypeAdapter(CompletionResult).validate_python(
            completion.model_dump(mode="json", by_alias=True)
        )
        == completion
    )
    raw = fact.model_dump(mode="json", by_alias=True)
    raw["sourceArtifactIds"] = [uid(999)]
    with pytest.raises(ValueError, match="lineage"):
        TranscriptCorpusArtifactFact.model_validate(raw)


@pytest.mark.parametrize(
    "name,expected",
    [
        (
            "AssistantTurnInputV1",
            "593b63d5a4eaa984b2b307fd79bd307db9e6326364829d398e0176bd76338afa",
        ),
        (
            "PrepareSolutionInputV1",
            "6a1a24681984df759356e3435adb2d7e2d2dc8e95b318e61440309ce581881ad",
        ),
        (
            "PrepareSolutionInputV2",
            "1df3e404a0f7f6c9ae966c0301a64eaeaae440e5ad8ce9d4be5a1d8b53724524",
        ),
        (
            "CompileScopeInputV2",
            "3bf2baf4b63f71c77779b55cecf32a35cb39ed9731e83a96f3d3d3c70e1d4349",
        ),
        (
            "CompileScopeInputV3",
            "7b32dcc6600a479667d04ce4ec5206293fac74839b0935f951ec818ca0eaebf1",
        ),
        (
            "ReviseScopeInputV2",
            "298f143eeacd1674cfcf2248b2ec8e74067b33ea355aad3d23b279e301a1265c",
        ),
        (
            "ExecuteResearchInputV2",
            "2cb1749417ba1615e8000ab0d135075e4c072da06d010412ab3f139682d3fefb",
        ),
        (
            "SynthesizeArtifactInputV1",
            "0245b747fb457e74f80244b0bc17b81f77fc1daae58b78ed0ac8ff0c228b42db",
        ),
        (
            "PrepareSolutionCompletedResult",
            "1faa61216bd0eba1c5129370169b5910ce51fef7fbb56db6fbcd31e1941a4383",
        ),
        (
            "ScopeCompiledResult",
            "740926f0f9bafc82c8046aeb7fdd98309a7cf46004f9dfc33a0104d204b715fb",
        ),
        (
            "ResearchCompletedResult",
            "e05eb8a598bf581c53be6fb6193b71bc34de139510cc665ee0cd574a3918b40f",
        ),
        (
            "TaskCompletedResult",
            "2a01329b4d70555040a1ca10aa7d89a9b9311b18f4c05914b62b91bc0386c776",
        ),
        (
            "EvaluationCompletedResult",
            "341f37b713cac041cd6f27d95751c642a6d7a0914f1803bf7dc6ec6374ac8083",
        ),
        (
            "ArtifactSynthesizedResult",
            "311ce1880b8fe9bf906d14d63a006cd6b353cf5ded9ca865d1d8072c9cabb634",
        ),
    ],
)
def test_every_previous_request_and_completion_schema_hash_is_unchanged(name, expected):
    encoded = json.dumps(
        getattr(contracts, name).model_json_schema(),
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    assert hashlib.sha256(encoded).hexdigest() == expected


def test_assistant_completion_schema_hash_tracks_deliberate_v2_response_union():
    """V1 payload bytes stay valid; this fingerprint changes to admit V2 responses."""

    encoded = json.dumps(
        contracts.AssistantTurnCompletedResult.model_json_schema(),
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    assert hashlib.sha256(encoded).hexdigest() == (
        "d7bccecb0a9ba78afe68fb0d5b0918c38b2ad9142601a93bb2cf114fc1c43bfe"
    )


def test_new_migration_is_guarded_and_previous_seven_schema_bytes_remain_pinned():
    root = Path(__file__).parents[2] / "database/workflow_v2"
    manifest = dict(
        line.split("  ")[::-1]
        for line in (root / "SCHEMA_SHA256").read_text().splitlines()
    )
    assert len(manifest) >= 8
    for name, digest in manifest.items():
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest
    expected = [
        "ae8881b1e734e2fcd059895611d94b2127772131083c55299cf9c6be7657c7c8",
        "4329c8188d9c62f745bdaaac9dcd0f9428f72a0217b6144a53900487188aa333",
        "803923e49e15bb8c24fdb3dc133e9a641a1c233caa1375058b2fa0f109f18307",
        "1839f4f9b5b75ee7463284d8c776332ed01261e2a28df091a16ca6cb2570ac4d",
        "7415c5d6af607ef18c1addfac51b057d9d29f6501e255fd0a1cc8f11f77f9ae4",
        "e2573b95a5d00d0104a705c4531cf40945d66ebc23b2f8287cf0dc131d6687df",
        "0f403f6bda956852f6c18a20d28782a974c294a0179b9099bbfd567f55dba7c9",
    ]
    assert [manifest[name] for name in sorted(manifest)[:7]] == expected
    sql = (root / "008_capability_analysis.sql").read_text()
    assert "current_definition IS DISTINCT FROM previous_definition" in sql
    assert "current_definition = expected_definition" in sql
    assert "candidate.convalidated" in sql
    assert "relrowsecurity AND relforcerowsecurity" in sql
    assert "SET LOCAL lock_timeout" in sql and "SET LOCAL statement_timeout" in sql
    for forbidden in (
        "GRANT ",
        "CREATE TABLE",
        "CREATE ROLE",
        "SECURITY DEFINER",
        "DISABLE ROW LEVEL SECURITY",
    ):
        assert forbidden not in sql
