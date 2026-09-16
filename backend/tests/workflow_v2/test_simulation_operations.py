"""Owned grounding, explicit selection and typed simulation lifecycle regressions."""

from __future__ import annotations

import asyncio
import copy
import hashlib
import socket
import time
from uuid import UUID

import pytest
from pydantic import TypeAdapter

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompletionResult,
    SimulateInputV1,
    SimulationArtifactFact,
    artifact_content_hash,
)
from backend.domain.workflow_v2.qualitative_analysis import (
    validate_qualitative_analysis,
)
from backend.services.workflow_v2.cognitive_executor import GeminiCognitiveExecutor
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.tests.workflow_v2.analysis_test_support import (
    AUTHORITY_KEY,
    Generator,
    Resolver,
    admission_input,
    analysis_input,
    corpus_fact,
    envelope,
    limits,
    ref,
    request,
    scope_fact,
    uid,
)
from backend.tests.workflow_v2.simulation_test_support import (
    SimulationGenerator,
    research_fact,
    simulation_input,
)
from backend.tests.workflow_v2.test_simulation_contracts import (
    ANSWER,
    request as simulation_request,
)

pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def reject(*_args, **_kwargs):
        raise AssertionError("simulation operation tests must not use network")

    monkeypatch.setattr(socket.socket, "connect", reject)
    monkeypatch.setattr(socket.socket, "connect_ex", reject)
    monkeypatch.setattr(socket, "create_connection", reject)


def executor(resolver=None, generator=None, analyzer=None):
    return GeminiCognitiveExecutor(
        scope_drafter=None,
        authority_key=AUTHORITY_KEY,
        artifact_resolver=resolver,
        simulation_generator=generator,
        analysis_generator=analyzer,
    )


@pytest.mark.asyncio
async def test_scenario_only_operation_is_typed_deterministic_and_explicitly_synthetic():
    resolver = Resolver(scope_fact())
    generator = SimulationGenerator()
    run = executor(resolver, generator)
    operation = envelope(simulation_input())
    first = await run.execute(operation)
    repeated = await run.execute(operation)
    assert first.artifact == repeated.artifact
    assert first.result_type == "simulation_completed"
    assert first.artifact.kind == "simulation"
    assert first.artifact.source_artifact_ids == [scope_fact().artifact_id]
    assert first.artifact.payload["origin"] == "synthetic"
    assert first.artifact.payload["grounding"]["status"] == "not_requested"
    assert first.metrics.model_calls == 1
    assert first.metrics.usage_complete is False
    assert (
        first.metrics.provider
        is first.metrics.model
        is first.metrics.model_version
        is None
    )
    assert (
        first.metrics.input_tokens
        is first.metrics.total_tokens
        is first.metrics.estimated_cost_micros
        is None
    )
    assert (
        first.metrics.search_calls == 0 and first.metrics.budget_scope == "invocation"
    )
    assert (
        TypeAdapter(CompletionResult).validate_python(
            first.model_dump(mode="json", by_alias=True)
        )
        == first
    )
    assert (
        AxWiseOperationEnvelope.model_validate(
            operation.model_dump(mode="json", by_alias=True)
        )
        == operation
    )


@pytest.mark.asyncio
async def test_only_explicit_exact_research_claim_reaches_generator_with_server_hash():
    source = research_fact(text="A fictional UTF-8 observation 🧭 with CRLF\r\n.")
    entry = next(
        row for row in source.payload["selectedClaims"] if "UTF-8" in row["text"]
    )
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    generator = SimulationGenerator(
        usage={
            "input_tokens": 11,
            "output_tokens": 12,
            "model_version": "synthetic-test-model-001",
        }
    )
    operation = envelope(simulation_input(source=source, entries=[entry]))
    result = await executor(resolver, generator).execute(operation)
    grounding = generator.calls[0][0].grounding
    assert len(grounding) == 1
    assert grounding[0].entry_id == entry["claimId"]
    assert grounding[0].text == entry["text"]
    assert (
        grounding[0].text_sha256 == hashlib.sha256(entry["text"].encode()).hexdigest()
    )
    assert result.artifact.payload["grounding"]["status"] == "applied"
    assert result.artifact.source_artifact_ids == sorted(
        [scope_fact().artifact_id, source.artifact_id], key=str
    )
    assert result.metrics.total_tokens == 23 and result.metrics.usage_complete is True
    assert result.metrics.provider is result.metrics.model is None
    assert result.metrics.model_version == "synthetic-test-model-001"
    assert resolver.calls[-1][-1] == ("ExecuteResearchV2",)


@pytest.mark.asyncio
async def test_exact_owned_analysis_quote_is_grounding_not_finding_or_full_transcript():
    corpus = corpus_fact()
    resolver = Resolver(scope_fact(), corpus)
    analyzed = await executor(resolver, analyzer=Generator()).execute(
        envelope(analysis_input(), operation_id=uid(211))
    )
    resolver.add(analyzed.artifact, operation_type="AnalyzeEvidenceV1")
    generator = SimulationGenerator()
    result = await executor(resolver, generator).execute(
        envelope(simulation_input(source=analyzed.artifact))
    )
    selected = generator.calls[0][0].grounding
    assert len(selected) == 1 and selected[0].entry_kind == "quote"
    assert selected[0].entry_id == analyzed.artifact.payload["quotes"][0]["quoteId"]
    assert selected[0].text == analyzed.artifact.payload["quotes"][0]["text"]
    assert result.artifact.payload["grounding"]["status"] == "applied"
    assert resolver.calls[-1][-1] == ("AnalyzeEvidenceV1",)


@pytest.mark.asyncio
async def test_simulation_to_analysis_preserves_exact_source_and_synthetic_basis():
    resolver = Resolver(scope_fact())
    run = executor(resolver, SimulationGenerator(), Generator())
    simulated = await run.execute(
        envelope(
            simulation_input(simulation_request=simulation_request(participants=2)),
            operation_id=uid(221),
        )
    )
    resolver.add(simulated.artifact, operation_type="SimulateV1")
    analysis_operation = envelope(
        analysis_input(
            source=simulated.artifact,
            analysis_request=request(outputs=["personas", "jobs_pains"]),
        ),
        operation_id=uid(222),
    )
    analyzed = await run.execute(analysis_operation)
    payload = analyzed.artifact.payload
    assert len(payload["personas"]) == 2
    assert all(
        quote["text"] == ANSWER and quote["origin"] == "synthetic_transcript"
        for quote in payload["quotes"]
    )
    assert all(
        finding["basis"] == "simulation_hypothesis" for finding in payload["findings"]
    )
    assert all(
        persona["origin"] == "synthetic_transcript" for persona in payload["personas"]
    )
    assert analyzed.artifact.source_artifact_ids == sorted(
        [scope_fact().artifact_id, simulated.artifact.artifact_id], key=str
    )
    assert validate_qualitative_analysis(
        payload,
        corpus=simulated.artifact.payload["corpus"],
        request=analysis_operation.input.request,
        accepted_scope=ref(scope_fact()),
        source_artifacts=[ref(simulated.artifact)],
    )


@pytest.mark.asyncio
async def test_simulation_corpus_readmission_preserves_document_and_parent_lineage():
    resolver = Resolver(scope_fact())
    run = executor(resolver, SimulationGenerator())
    simulated = await run.execute(envelope(simulation_input(), operation_id=uid(231)))
    resolver.add(simulated.artifact, operation_type="SimulateV1")
    corpus = copy.deepcopy(simulated.artifact.payload["corpus"])
    for doc in corpus["documents"]:
        doc["originArtifactRefs"] = [ref(simulated.artifact)]
    admitted = await run.execute(
        envelope(admission_input(corpus), operation_id=uid(232))
    )
    assert admitted.artifact.payload == corpus
    assert admitted.artifact.source_artifact_ids == [simulated.artifact.artifact_id]
    assert admitted.metrics.model_calls == 0


@pytest.mark.parametrize(
    "change",
    [
        "missing_selection",
        "duplicate_selection",
        "entry_kind",
        "artifact_hash",
        "artifact_kind",
        "caller_text",
        "caller_text_hash",
        "scope_kind",
        "no_requested",
    ],
)
def test_unsupported_or_inexact_input_is_rejected_before_admission(change):
    raw = simulation_input(source=research_fact())
    if change == "missing_selection":
        raw["selectedGrounding"] = []
    elif change == "duplicate_selection":
        raw["selectedGrounding"] *= 2
    elif change == "entry_kind":
        raw["selectedGrounding"][0]["entryKind"] = "quote"
    elif change == "artifact_hash":
        raw["selectedGrounding"][0]["artifact"]["artifactHash"] = "0" * 64
    elif change == "artifact_kind":
        for item in [
            raw["selectedGrounding"][0]["artifact"],
            raw["request"]["grounding"]["sourceArtifacts"][0],
        ]:
            item["kind"] = "transcript_corpus"
    elif change in {"caller_text", "caller_text_hash"}:
        raw["selectedGrounding"][0][
            "text" if change == "caller_text" else "textSha256"
        ] = "private-untrusted-marker"
    elif change == "scope_kind":
        raw["acceptedScope"]["kind"] = "research"
    else:
        raw["request"]["requested"] = False
    with pytest.raises(ValueError):
        SimulateInputV1.model_validate(raw)


@pytest.mark.asyncio
@pytest.mark.parametrize("mismatch", ["tenant", "user", "run", "producer", "missing"])
async def test_owned_grounding_mismatch_is_terminal_before_generation(mismatch):
    source = research_fact()
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    if mismatch == "missing":
        resolver.facts.pop(str(source.artifact_id))
    else:
        resolver.facts[str(source.artifact_id)][mismatch] = (
            "user_wrong123"
            if mismatch == "user"
            else ("AdmitTranscriptCorpusV1" if mismatch == "producer" else uid(999))
        )
    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="SOURCE_NOT_ADMITTED") as error:
        await executor(resolver, generator).execute(
            envelope(simulation_input(source=source))
        )
    assert error.value.retryable is False and not generator.calls


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mismatch", ["artifactId", "artifactHash", "kind", "payload", "lineage"]
)
async def test_corrupt_owned_source_is_rejected_before_generation(mismatch):
    source = research_fact()
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    raw = resolver.facts[str(source.artifact_id)]["artifact"]
    if mismatch == "payload":
        raw["payload"]["selectedClaims"][0]["text"] += " forged"
    elif mismatch == "lineage":
        raw["sourceArtifactIds"] = []
    else:
        raw[mismatch] = {
            "artifactId": uid(999),
            "artifactHash": "0" * 64,
            "kind": "qualitative_analysis",
        }[mismatch]
    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="SOURCE_NOT_ADMITTED"):
        await executor(resolver, generator).execute(
            envelope(simulation_input(source=source))
        )
    assert not generator.calls


@pytest.mark.asyncio
async def test_nonexistent_selected_entry_cannot_fall_back_to_whole_source():
    source = research_fact()
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    raw = simulation_input(source=source)
    raw["selectedGrounding"][0]["entryId"] = "0" * 64
    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="GROUNDING_ENTRY_NOT_FOUND"):
        await executor(resolver, generator).execute(envelope(raw))
    assert not generator.calls


@pytest.mark.asyncio
async def test_exact_source_passage_byte_cap_is_checked_before_generation():
    source = research_fact(text="😀" * 8000)
    resolver = Resolver(scope_fact())
    resolver.add(source, operation_type="ExecuteResearchV2")
    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="GROUNDING_INVALID"):
        await executor(resolver, generator).execute(
            envelope(
                simulation_input(
                    source=source, entries=source.payload["selectedClaims"]
                )
            )
        )
    assert not generator.calls


@pytest.mark.asyncio
async def test_hmac_authority_is_verified_before_grounding_reads_or_generation():
    scope = scope_fact()
    raw = scope.model_dump(mode="json", by_alias=True)
    raw["payload"]["authority"]["seal"] = "0" * 64
    raw["artifactHash"] = artifact_content_hash(
        content_type="application/json", payload=raw["payload"], markdown=None
    )
    bad_scope = type(scope).model_validate(raw)
    resolver = Resolver(bad_scope)
    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="SCOPE_AUTHORITY_INVALID"):
        await executor(resolver, generator).execute(
            envelope(simulation_input(scope=bad_scope, source=research_fact()))
        )
    assert len(resolver.calls) == 1 and not generator.calls


@pytest.mark.asyncio
async def test_default_generator_is_unconfigured_not_empty_success_or_fallback():
    with pytest.raises(
        CognitiveExecutionFailure, match="SIMULATION_GENERATOR_UNAVAILABLE"
    ) as error:
        await executor(Resolver(scope_fact())).execute(envelope(simulation_input()))
    assert error.value.retryable is False


class WaitingGenerator:
    def __init__(self):
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def generate(self, *_args, **_kwargs):
        self.started.set()
        try:
            await asyncio.Event().wait()
        finally:
            self.cancelled.set()


@pytest.mark.asyncio
async def test_operation_cancellation_cancels_subordinate_generation():
    generator = WaitingGenerator()
    task = asyncio.create_task(
        executor(Resolver(scope_fact()), generator).execute(
            envelope(simulation_input())
        )
    )
    await generator.started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert generator.cancelled.is_set()


@pytest.mark.asyncio
async def test_deadline_includes_owned_lookup_and_is_not_reset_for_generation():
    class SlowResolver(Resolver):
        def owned_artifact_fact(self, *args, **kwargs):
            time.sleep(0.030)
            return super().owned_artifact_fact(*args, **kwargs)

    generator = SimulationGenerator()
    await executor(SlowResolver(scope_fact()), generator).execute(
        envelope(simulation_input(request_limits=limits(deadlineMs=500)))
    )
    assert generator.calls[0][2].deadline_ms < 480
    waiting = WaitingGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="SIMULATION_DEADLINE") as error:
        await executor(SlowResolver(scope_fact()), waiting).execute(
            envelope(simulation_input(request_limits=limits(deadlineMs=60)))
        )
    assert error.value.retryable is False and waiting.cancelled.is_set()


@pytest.mark.asyncio
async def test_lookup_timeout_prevents_generator_start():
    class SlowResolver(Resolver):
        def owned_artifact_fact(self, *args, **kwargs):
            time.sleep(0.040)
            return super().owned_artifact_fact(*args, **kwargs)

    generator = SimulationGenerator()
    with pytest.raises(CognitiveExecutionFailure, match="SIMULATION_DEADLINE"):
        await executor(SlowResolver(scope_fact()), generator).execute(
            envelope(simulation_input(request_limits=limits(deadlineMs=15)))
        )
    assert not generator.calls


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["operation", "lineage", "hash"])
async def test_simulation_completion_cannot_relabel_identity_or_lineage(change):
    result = await executor(Resolver(scope_fact()), SimulationGenerator()).execute(
        envelope(simulation_input())
    )
    raw = result.artifact.model_dump(mode="json", by_alias=True)
    if change == "operation":
        raw["artifactId"] = uid(999)
    elif change == "lineage":
        raw["sourceArtifactIds"] = []
    else:
        raw["artifactHash"] = "0" * 64
    with pytest.raises(ValueError):
        SimulationArtifactFact.model_validate(raw)
