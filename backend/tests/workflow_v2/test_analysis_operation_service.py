"""Offline end-to-end admission, provenance, budgets and cancellation boundaries."""

from __future__ import annotations

import asyncio
import copy
import socket
import time
from dataclasses import replace
from types import SimpleNamespace
from uuid import UUID

import pytest
from pydantic import TypeAdapter

from backend.domain.workflow_v2.contracts import (
    AnalyzeEvidenceInputV1,
    CompletionResult,
    QualitativeAnalysisArtifactFact,
    artifact_content_hash,
    canonical_hash,
)
from backend.domain.workflow_v2.qualitative_analysis import (
    validate_qualitative_analysis,
)
from backend.services.workflow_v2.analysis_candidates import AnalysisCandidateV1
from backend.services.workflow_v2.analysis_service import (
    AnalysisGenerationResult,
    AnalysisOperationHandler,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.operation_store import PostgresOperationStore
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    USER_ID,
    Generator,
    Resolver,
    admission_input,
    analysis_input,
    candidate,
    corpus,
    corpus_fact,
    document,
    envelope,
    limits,
    ref,
    request,
    scope_fact,
    uid,
)


pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("analysis service tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def executor(resolver=None, generator=None):
    return GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        analysis_generator=generator,
    )


@pytest.mark.asyncio
async def test_model_free_admission_then_analysis_resolves_real_artifact_and_keeps_raw_bytes():
    raw = corpus(document(text="I prefer Café e\u0301 updates 🧭.\r\n"))
    before = copy.deepcopy(raw)
    generator = Generator(
        usage={
            "input_tokens": 50,
            "output_tokens": 70,
            "model": "synthetic-test-model",
            "model_version": "synthetic-test-model-001",
        }
    )
    resolver = Resolver(scope_fact())
    run = executor(resolver, generator)
    admitted = await run.execute(envelope(admission_input(raw), operation_id=uid(201)))
    assert admitted.result_type == "transcript_corpus_admitted"
    assert admitted.artifact.payload == before == raw
    assert admitted.metrics.model_calls == 0
    assert admitted.metrics.provider is None
    assert admitted.metrics.estimated_cost_micros == 0
    assert not generator.calls
    resolver.add(admitted.artifact)
    operation = envelope(
        analysis_input(source=admitted.artifact), operation_id=uid(202)
    )
    completed = await run.execute(operation)
    assert completed.result_type == "evidence_analyzed"
    assert len(generator.calls) == 1
    assert completed.artifact.artifact_id != admitted.artifact.artifact_id
    assert completed.artifact.source_artifact_ids == sorted(
        [scope_fact().artifact_id, admitted.artifact.artifact_id], key=str
    )
    payload = completed.artifact.payload
    assert payload["coverageStatus"] == "complete"
    assert payload["quotes"][0]["text"] == raw["documents"][0]["text"]
    assert payload["quotes"][0]["end"] == len(
        raw["documents"][0]["text"].encode("utf-8")
    )
    assert payload["findings"][0]["basis"] == "source_statement"
    assert completed.metrics.total_tokens == 120
    assert completed.metrics.model_calls == 1
    assert completed.metrics.usage_complete is True
    assert completed.metrics.budget_scope == "invocation"
    assert completed.metrics.estimated_cost_micros is None
    assert (
        TypeAdapter(CompletionResult).validate_python(
            completed.model_dump(mode="json", by_alias=True)
        )
        == completed
    )
    assert validate_qualitative_analysis(
        payload,
        corpus=admitted.artifact.payload,
        request=operation.input.request,
        accepted_scope=operation.input.accepted_scope.model_dump(
            mode="json", by_alias=True
        ),
        source_artifacts=[ref(admitted.artifact)],
    )


@pytest.mark.asyncio
async def test_admission_is_deterministic_per_operation_and_does_not_relabel_synthetic_material():
    raw = corpus(document(origin="synthetic_transcript"))
    run = executor()
    value = envelope(admission_input(raw))
    first = await run.execute(value)
    repeated = await run.execute(value)
    different = await run.execute(envelope(admission_input(raw), operation_id=uid(999)))
    assert first.artifact == repeated.artifact
    assert first.artifact.artifact_hash == different.artifact.artifact_hash
    assert first.artifact.artifact_id != different.artifact.artifact_id
    assert first.artifact.payload["documents"][0]["origin"] == "synthetic_transcript"


@pytest.mark.asyncio
async def test_distinct_people_with_same_display_label_and_mixed_origins_stay_distinct():
    source = corpus_fact(
        corpus(document(), document(number=2, origin="synthetic_transcript"))
    )
    run = executor(Resolver(scope_fact(), source), Generator())
    result = await run.execute(
        envelope(
            analysis_input(
                source=source,
                analysis_request=request(outputs=["personas", "jobs_pains"]),
            )
        )
    )
    assert len(result.artifact.payload["personas"]) == 2
    assert len({item["personaId"] for item in result.artifact.payload["personas"]}) == 2
    assert {item["origin"] for item in result.artifact.payload["personas"]} == {
        "supplied_transcript",
        "synthetic_transcript",
    }
    synthetic_quotes = {
        item["quoteId"]
        for item in result.artifact.payload["quotes"]
        if item["origin"] == "synthetic_transcript"
    }
    assert all(
        item["basis"] == "simulation_hypothesis"
        for item in result.artifact.payload["findings"]
        if set(item["quoteIds"]) & synthetic_quotes
    )


@pytest.mark.asyncio
async def test_owned_prior_corpus_can_be_referenced_without_rewriting_its_document():
    parent = corpus_fact()
    raw = copy.deepcopy(parent.payload)
    raw["documents"][0]["originArtifactRefs"] = [ref(parent)]
    resolver = Resolver(parent)
    admitted = await executor(resolver).execute(envelope(admission_input(raw)))
    assert admitted.artifact.payload == raw
    assert admitted.artifact.source_artifact_ids == [parent.artifact_id]
    assert len(resolver.calls) == 1
    assert resolver.calls[0][-1] == ("AdmitTranscriptCorpusV1",)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change", ["origin", "speaker", "question", "coordinates", "document"]
)
async def test_referenced_origin_cannot_be_laundered_through_readmission(change):
    parent = corpus_fact(corpus(document(origin="synthetic_transcript")))
    raw = copy.deepcopy(parent.payload)
    doc = raw["documents"][0]
    doc["originArtifactRefs"] = [ref(parent)]
    if change == "origin":
        doc["origin"] = "supplied_transcript"
    elif change == "speaker":
        doc["participants"][0]["displayName"] = "Different source speaker"
    elif change == "question":
        doc["turns"][0]["questionId"] = "different-question"
    elif change == "coordinates":
        doc["turns"][0]["start"] = 1
    else:
        doc["documentId"] = uid(88)
    with pytest.raises(CognitiveExecutionFailure, match="ORIGIN_BINDING_MISMATCH"):
        await executor(Resolver(parent)).execute(envelope(admission_input(raw)))


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["research", "unknown"])
async def test_unimplemented_origin_adapters_are_rejected_without_erasing_lineage(kind):
    raw = corpus(document(origin="synthetic_transcript"))
    raw["documents"][0]["originArtifactRefs"] = [
        {"artifactId": uid(102), "artifactHash": "a" * 64, "kind": kind}
    ]
    resolver = Resolver()
    with pytest.raises(CognitiveExecutionFailure, match="SOURCE_KIND_UNSUPPORTED"):
        await executor(resolver).execute(envelope(admission_input(raw)))
    assert resolver.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize("mismatch", ["tenant", "user", "run", "producer", "missing"])
async def test_access_or_producer_mismatch_stops_before_generation(mismatch):
    source = corpus_fact()
    resolver = Resolver(scope_fact(), source)
    record = resolver.facts[str(source.artifact_id)]
    if mismatch == "missing":
        resolver.facts.pop(str(source.artifact_id))
    else:
        record[mismatch] = (
            "user_other123"
            if mismatch == "user"
            else ("ExecuteResearchV2" if mismatch == "producer" else uid(999))
        )
    generator = Generator()
    with pytest.raises(CognitiveExecutionFailure, match="SOURCE_NOT_ADMITTED"):
        await executor(resolver, generator).execute(
            envelope(analysis_input(source=source))
        )
    assert generator.calls == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mismatch", ["artifactId", "artifactHash", "kind", "payload", "lineage"]
)
async def test_stored_artifact_corruption_stops_before_generation(mismatch):
    source = corpus_fact()
    resolver = Resolver(scope_fact(), source)
    raw = resolver.facts[str(source.artifact_id)]["artifact"]
    if mismatch == "payload":
        raw["payload"]["documents"][0]["text"] += " forged"
    elif mismatch == "lineage":
        raw["sourceArtifactIds"] = [uid(991)]
    else:
        raw[mismatch] = {
            "artifactId": uid(999),
            "artifactHash": "0" * 64,
            "kind": "research",
        }[mismatch]
    generator = Generator()
    with pytest.raises(CognitiveExecutionFailure, match="SOURCE_NOT_ADMITTED"):
        await executor(resolver, generator).execute(
            envelope(analysis_input(source=source))
        )
    assert not generator.calls


@pytest.mark.asyncio
async def test_actual_scope_authority_seal_is_verified_before_source_or_generator():
    scope = scope_fact()
    raw = scope.model_dump(mode="json", by_alias=True)
    raw["payload"]["authority"]["seal"] = "0" * 64
    raw["artifactHash"] = artifact_content_hash(
        content_type="application/json", payload=raw["payload"], markdown=None
    )
    bad_scope = type(scope).model_validate(raw)
    resolver = Resolver(bad_scope, corpus_fact())
    generator = Generator()
    with pytest.raises(CognitiveExecutionFailure, match="SCOPE_AUTHORITY_INVALID"):
        await executor(resolver, generator).execute(
            envelope(analysis_input(scope=bad_scope))
        )
    assert len(resolver.calls) == 1
    assert not generator.calls


@pytest.mark.asyncio
async def test_default_production_generator_is_disabled_not_fallback_or_empty_success():
    with pytest.raises(
        CognitiveExecutionFailure, match="ANALYSIS_GENERATION_DISABLED"
    ) as caught:
        await executor(Resolver(scope_fact(), corpus_fact())).execute(
            envelope(analysis_input())
        )
    assert caught.value.retryable is False


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mismatch",
    [
        "text",
        "span",
        "speaker",
        "question",
        "paraphrase",
        "missing_quote",
        "extra_persona",
        "unsupported_category",
        "silent_empty",
    ],
)
async def test_candidate_failures_never_become_success_or_invented_personas(mismatch):
    def modify(value, _context):
        raw = value.model_dump(mode="json", by_alias=True)
        if mismatch == "text":
            raw["quotes"][0]["text"] = "Invented testimony"
        elif mismatch == "span":
            raw["quotes"][0]["start"] = 1
        elif mismatch == "speaker":
            raw["quotes"][0]["participantId"] = "someone-else"
        elif mismatch == "question":
            raw["findings"][0]["questionIds"] = ["interview-q1"]
        elif mismatch == "paraphrase":
            raw["findings"][0]["statement"] = "A paraphrase is not a source statement."
        elif mismatch == "missing_quote":
            raw["findings"][0]["quoteKeys"] = []
        elif mismatch == "extra_persona":
            raw["personas"] = [
                {
                    "participantRef": {"documentId": uid(1), "participantId": "p1"},
                    "displayLabel": "Invented persona",
                    "traitFindingKeys": [raw["findings"][0]["key"]],
                }
            ]
        elif mismatch == "unsupported_category":
            raw["findings"][0]["category"] = "trait"
        else:
            raw.update(quotes=[], findings=[], personas=[], gaps=[])
        return AnalysisCandidateV1.model_validate(raw)

    generator = Generator(modify=modify)
    with pytest.raises(
        CognitiveExecutionFailure, match="ANALYSIS_INVALID_OUTPUT"
    ) as caught:
        await executor(Resolver(scope_fact(), corpus_fact()), generator).execute(
            envelope(analysis_input())
        )
    assert caught.value.retryable is False
    assert len(generator.calls) == 1
    assert "Invented testimony" not in str(caught.value)


@pytest.mark.asyncio
async def test_labelled_interpretation_is_not_mislabeled_as_verbatim_source():
    def modify(value, _context):
        raw = value.model_dump(mode="json", by_alias=True)
        raw["findings"][0].update(
            basis="interpretation",
            statement="Manual copying appears to be a source of friction.",
        )
        return AnalysisCandidateV1.model_validate(raw)

    result = await executor(
        Resolver(scope_fact(), corpus_fact()), Generator(modify=modify)
    ).execute(envelope(analysis_input()))
    assert result.artifact.payload["findings"][0]["basis"] == "interpretation"
    assert any(
        "interpretations" in value for value in result.artifact.payload["limitations"]
    )


@pytest.mark.asyncio
async def test_targeted_insufficient_material_returns_a_blocked_artifact_not_execution_failure():
    def modify(_value, _context):
        return AnalysisCandidateV1.model_validate(
            {
                "quotes": [],
                "findings": [],
                "personas": [],
                "gaps": [
                    {
                        "code": "insufficient_evidence",
                        "questionId": "analysis-q1",
                        "participantRef": {"documentId": uid(1), "participantId": "p1"},
                        "output": "jobs_pains",
                        "message": "The supplied material does not answer this question.",
                    }
                ],
                "limitations": [],
            }
        )

    result = await executor(
        Resolver(scope_fact(), corpus_fact()), Generator(modify=modify)
    ).execute(envelope(analysis_input()))
    assert result.artifact.payload["coverageStatus"] == "blocked"
    assert result.artifact.payload["findings"] == []


@pytest.mark.asyncio
async def test_unknown_usage_stays_unknown_including_cost_and_total():
    result = await executor(Resolver(scope_fact(), corpus_fact()), Generator()).execute(
        envelope(analysis_input())
    )
    assert result.metrics.input_tokens is None
    assert result.metrics.output_tokens is None
    assert result.metrics.total_tokens is None
    assert result.metrics.estimated_cost_micros is None
    assert result.metrics.usage_complete is False
    assert result.metrics.model_version is None
    assert result.metrics.provider is None


@pytest.mark.asyncio
async def test_only_an_explicit_allowlisted_provider_receipt_is_published():
    generator = Generator(
        usage={
            "provider": "google",
            "model": "models/gemini-test",
            "model_version": "gemini-test-001",
        }
    )
    result = await executor(Resolver(scope_fact(), corpus_fact()), generator).execute(
        envelope(analysis_input())
    )
    assert result.metrics.provider == "google"
    assert result.metrics.model_version == "gemini-test-001"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,bad",
    [
        ("provider", "unknown"),
        ("provider", True),
        ("model", "private model content"),
        ("model_version", "private\ntranscript"),
        ("model", "x" * 201),
    ],
)
async def test_unsafe_provider_and_model_receipts_are_not_exposed(field, bad):
    with pytest.raises(
        CognitiveExecutionFailure, match="ANALYSIS_INVALID_OUTPUT"
    ) as caught:
        await executor(
            Resolver(scope_fact(), corpus_fact()), Generator(usage={field: bad})
        ).execute(envelope(analysis_input()))
    assert str(bad) not in str(caught.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,bad",
    [
        ("input_tokens", 120_001),
        ("output_tokens", 65_537),
        ("input_tokens", True),
        ("output_tokens", "1"),
    ],
)
async def test_over_budget_or_noninteger_usage_cannot_be_published(field, bad):
    with pytest.raises(CognitiveExecutionFailure, match="INVALID_OUTPUT"):
        await executor(
            Resolver(scope_fact(), corpus_fact()), Generator(usage={field: bad})
        ).execute(envelope(analysis_input()))


@pytest.mark.asyncio
async def test_request_limits_are_intersected_with_server_policy():
    generator = Generator()
    await executor(Resolver(scope_fact(), corpus_fact()), generator).execute(
        envelope(
            analysis_input(
                request_limits=limits(
                    deadlineMs=900_000,
                    maxModelCalls=32,
                    maxInputTokens=2_000_000,
                    maxOutputTokens=2_000_000,
                )
            )
        )
    )
    assert generator.calls[0][1].model_dump(mode="json", by_alias=True) == limits()


@pytest.mark.asyncio
async def test_generator_failure_is_not_converted_to_a_blocked_success():
    class Failure:
        async def analyze(self, *_args, **_kwargs):
            raise CognitiveExecutionFailure("AXWISE_MODEL_UNAVAILABLE", retryable=True)

    with pytest.raises(CognitiveExecutionFailure, match="MODEL_UNAVAILABLE"):
        await executor(Resolver(scope_fact(), corpus_fact()), Failure()).execute(
            envelope(analysis_input())
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error_type,code",
    [
        (ValueError, "AXWISE_ANALYSIS_INVALID_OUTPUT"),
        (RuntimeError, "AXWISE_ANALYSIS_GENERATION_FAILED"),
    ],
)
async def test_generic_generator_errors_have_finite_content_free_codes(
    error_type, code
):
    class Failure:
        async def analyze(self, *_args, **_kwargs):
            raise error_type("private-transcript-marker")

    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor(Resolver(scope_fact(), corpus_fact()), Failure()).execute(
            envelope(analysis_input())
        )
    assert caught.value.error_class == code
    assert "private-transcript-marker" not in str(caught.value)


@pytest.mark.asyncio
async def test_generator_cannot_publish_after_suppressing_cancellation():
    class Suppressed:
        async def analyze(self, context, **_kwargs):
            asyncio.current_task().cancel()
            try:
                await asyncio.sleep(0)
            except asyncio.CancelledError:
                return AnalysisGenerationResult(
                    candidate=candidate(context), model_calls=1
                )

    with pytest.raises(asyncio.CancelledError):
        await executor(Resolver(scope_fact(), corpus_fact()), Suppressed()).execute(
            envelope(analysis_input())
        )


@pytest.mark.asyncio
async def test_deadline_cancels_generator_and_is_terminal():
    cancelled = asyncio.Event()

    class Never:
        async def analyze(self, *_args, **_kwargs):
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise

    with pytest.raises(CognitiveExecutionFailure, match="ANALYSIS_DEADLINE") as caught:
        await executor(Resolver(scope_fact(), corpus_fact()), Never()).execute(
            envelope(analysis_input(request_limits=limits(deadlineMs=50)))
        )
    assert cancelled.is_set()
    assert caught.value.retryable is False


@pytest.mark.asyncio
async def test_deadline_includes_synchronous_result_materialization(monkeypatch):
    from backend.services.workflow_v2 import analysis_service

    original = analysis_service.materialize_analysis

    def slow_materialize(*args, **kwargs):
        time.sleep(0.060)
        return original(*args, **kwargs)

    monkeypatch.setattr(analysis_service, "materialize_analysis", slow_materialize)
    generator = Generator()
    with pytest.raises(CognitiveExecutionFailure, match="ANALYSIS_DEADLINE") as caught:
        await executor(Resolver(scope_fact(), corpus_fact()), generator).execute(
            envelope(analysis_input(request_limits=limits(deadlineMs=40)))
        )
    assert len(generator.calls) == 1 and caught.value.retryable is False


@pytest.mark.asyncio
async def test_parent_cancellation_propagates_without_publication_or_extra_generation():
    started, cancelled = asyncio.Event(), asyncio.Event()

    class Never:
        async def analyze(self, *_args, **_kwargs):
            started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise

    task = asyncio.create_task(
        executor(Resolver(scope_fact(), corpus_fact()), Never()).execute(
            envelope(analysis_input())
        )
    )
    await asyncio.wait_for(started.wait(), 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_forged_internal_envelope_and_generator_values_are_revalidated():
    value = envelope(analysis_input())
    consumed = []

    def entries():
        consumed.append(True)
        yield "forbidden"

    scope = value.input.scope.model_copy(update={"geography": entries()})
    forged_input = value.input.model_copy(update={"scope": scope})
    forged = value.model_copy(update={"input": forged_input})
    generator = Generator()
    with pytest.raises(CognitiveExecutionFailure, match="CAPABILITY_INVALID_INPUT"):
        await executor(Resolver(scope_fact(), corpus_fact()), generator).execute(forged)
    assert not consumed and not generator.calls


def test_owned_database_reader_keeps_tenant_rls_and_owner_run_producer_filters():
    class Connection:
        def __init__(self):
            self.calls = []

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, statement, params):
            self.calls.append((str(statement), params))
            return SimpleNamespace(
                all=lambda: [SimpleNamespace(artifact={"stored": True})]
            )

    connection = Connection()
    store = PostgresOperationStore(SimpleNamespace(begin=lambda: connection))
    result = store.owned_artifact_fact(
        UUID(uid(901)),
        USER_ID,
        UUID(uid(902)),
        UUID(uid(102)),
        operation_types=("AdmitTranscriptCorpusV1",),
    )
    assert result == {"stored": True}
    assert "set_config('axwise.tenant_id'" in connection.calls[0][0]
    sql, parameters = connection.calls[1]
    for clause in (
        "tenant_id = :tenant_id",
        "user_id = :user_id",
        "run_id = :run_id",
        "operation_type = ANY(:operation_types)",
        "status = 'completed'",
        "LIMIT 2",
    ):
        assert clause in sql
    assert parameters["operation_types"] == ["AdmitTranscriptCorpusV1"]


def test_ambiguous_owned_artifact_identity_fails_closed():
    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, *_args):
            return SimpleNamespace(
                all=lambda: [SimpleNamespace(artifact={}), SimpleNamespace(artifact={})]
            )

    store = PostgresOperationStore(SimpleNamespace(begin=lambda: Connection()))
    with pytest.raises(RuntimeError, match="ambiguous"):
        store.owned_artifact_fact(
            UUID(uid(901)),
            USER_ID,
            UUID(uid(902)),
            UUID(uid(102)),
            operation_types=("AdmitTranscriptCorpusV1",),
        )
