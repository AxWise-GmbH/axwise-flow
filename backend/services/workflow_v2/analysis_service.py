"""Explicit corpus admission and qualitative analysis on the existing operation ledger.

No scheduler, callback, response cache, source search, or legacy persona facade.
The caller owns operation adoption and leases. This handler owns source admission
and publication; an injected generator only proposes bounded candidate content.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Callable, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

from backend.domain.workflow_v2.capability_limits import (
    CapabilityLimitsV1,
    effective_capability_limits,
    validate_capability_structure,
)
from backend.domain.workflow_v2.contracts import (
    AdmitTranscriptCorpusInputV1,
    AnalyzeEvidenceInputV1,
    ArtifactFact,
    ArtifactRef,
    AxWiseOperationEnvelope,
    CapabilityOperationMetrics,
    EvidenceAnalyzedResult,
    QualitativeAnalysisArtifactFact,
    ResearchArtifactFact,
    ScopeArtifactFact,
    ScopeArtifactV2,
    SimulationArtifactFact,
    TranscriptCorpusAdmittedResult,
    TranscriptCorpusArtifactFact,
    artifact_content_hash,
    canonical_json,
)
from backend.domain.workflow_v2.qualitative_analysis import (
    AnalysisRequestV1,
    validate_analysis_request,
)
from backend.domain.workflow_v2.simulation import SimulationV1
from backend.domain.workflow_v2.transcript_corpus import (
    CorpusArtifactRefV1,
    TranscriptCorpusV1,
    validate_transcript_corpus,
)
from backend.services.workflow_v2.analysis_candidates import (
    AnalysisCandidateV1,
    materialize_analysis,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.capability_generation_payloads import (
    analysis_generation_payload,
)
from backend.services.workflow_v2.capability_processing import (
    CapabilityProcessingPermit,
    issue_processing_permit,
)


ANALYSIS_POLICY = CapabilityLimitsV1.model_validate(
    {
        "deadlineMs": 180_000,
        "maxModelCalls": 3,
        "maxInputTokens": 120_000,
        "maxOutputTokens": 65_536,
    }
)
ADMISSION_DEADLINE_SECONDS = 90


@dataclass(frozen=True)
class AnalysisGenerationContext:
    corpus: TranscriptCorpusV1
    request: AnalysisRequestV1
    accepted_scope: CorpusArtifactRefV1
    source_artifacts: tuple[CorpusArtifactRefV1, ...]
    operation_id: UUID | None = None
    processing_permit: CapabilityProcessingPermit | None = None


@dataclass(frozen=True)
class AnalysisGenerationResult:
    candidate: AnalysisCandidateV1
    model_calls: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    model_version: str | None = None
    model: str | None = None
    provider: str | None = None


class AnalysisGenerator(Protocol):
    async def analyze(
        self,
        context: AnalysisGenerationContext,
        *,
        limits: CapabilityLimitsV1,
        deadline: float,
    ) -> AnalysisGenerationResult: ...


class OwnedArtifactResolver(Protocol):
    def owned_artifact_fact(
        self,
        tenant_id: UUID,
        user_id: str,
        run_id: UUID,
        artifact_id: UUID,
        *,
        operation_types: tuple[str, ...],
    ) -> dict[str, Any] | None: ...


def _fail(code: str, *, retryable: bool = False) -> CognitiveExecutionFailure:
    return CognitiveExecutionFailure(code, retryable=retryable)


def revalidate_capability_envelope(
    envelope: AxWiseOperationEnvelope,
) -> AxWiseOperationEnvelope:
    # Recheck canonical ownership/input identity even for internal model_copy users.
    try:
        validate_capability_structure(envelope)
        return AxWiseOperationEnvelope.model_validate(
            envelope.model_dump(mode="json", by_alias=True, warnings="error")
        )
    except (TypeError, ValueError, OverflowError) as error:
        raise _fail("AXWISE_CAPABILITY_INVALID_INPUT") from error


def _exact_reference(fact: ArtifactFact, reference: ArtifactRef) -> bool:
    return (
        fact.artifact_id == reference.artifact_id
        and fact.artifact_hash == reference.artifact_hash
        and fact.kind == reference.kind
    )


async def resolve_owned_capability_artifact(
    resolver: OwnedArtifactResolver | None,
    envelope: AxWiseOperationEnvelope,
    reference: ArtifactRef,
    *,
    kind: str,
) -> ArtifactFact:
    lookup = getattr(resolver, "owned_artifact_fact", None)
    if not callable(lookup):
        raise _fail("AXWISE_CAPABILITY_SOURCE_RESOLVER_UNAVAILABLE", retryable=True)
    producers = {
        "scope": ("CompileScopeV2", "CompileScopeV3", "ReviseScopeV2"),
        "transcript_corpus": ("AdmitTranscriptCorpusV1",),
        "research": ("ExecuteResearchV2",),
        "qualitative_analysis": ("AnalyzeEvidenceV1",),
        "simulation": ("SimulateV1",),
    }
    if kind not in producers or reference.kind != kind:
        raise _fail("AXWISE_CAPABILITY_SOURCE_KIND_UNSUPPORTED")
    try:
        raw = await asyncio.to_thread(
            lookup,
            envelope.owner.tenant_id,
            envelope.owner.user_id,
            envelope.workflow.run_id,
            reference.artifact_id,
            operation_types=producers[kind],
        )
        if type(raw) is not dict:
            raise ValueError("owned source artifact is absent")
        fact_type = {
            "scope": ScopeArtifactFact,
            "transcript_corpus": TranscriptCorpusArtifactFact,
            "research": ResearchArtifactFact,
            "qualitative_analysis": QualitativeAnalysisArtifactFact,
            "simulation": SimulationArtifactFact,
        }[kind]
        fact = fact_type.model_validate(raw)
        if not _exact_reference(fact, reference):
            raise ValueError("owned artifact reference changed")
        return fact
    except (TypeError, ValueError, RuntimeError) as error:
        raise _fail("AXWISE_CAPABILITY_SOURCE_NOT_ADMITTED") from error


def _fact(
    envelope: AxWiseOperationEnvelope,
    *,
    kind: str,
    payload: dict[str, Any],
    source_ids: list[UUID],
) -> TranscriptCorpusArtifactFact | QualitativeAnalysisArtifactFact:
    fact_type = (
        TranscriptCorpusArtifactFact
        if kind == "transcript_corpus"
        else QualitativeAnalysisArtifactFact
    )
    return fact_type(
        artifact_id=uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:{kind}"),
        artifact_hash=artifact_content_hash(
            content_type="application/json", payload=payload, markdown=None
        ),
        kind=kind,
        content_type="application/json",
        payload=payload,
        markdown=None,
        source_artifact_ids=sorted(set(source_ids), key=str),
    )


def _source_document_core(document: Any) -> dict[str, Any]:
    # Adding an exact parent reference is allowed; replacing its speaker, text,
    # source-document identity, origin, question or turn coordinates is not.
    return document.model_dump(
        mode="json", by_alias=True, exclude={"origin_artifact_refs"}
    )


class AnalysisOperationHandler:
    def __init__(
        self,
        *,
        artifact_resolver: OwnedArtifactResolver | None,
        verify_scope_authority: Callable[..., None],
        generator: AnalysisGenerator | None,
    ) -> None:
        self.artifact_resolver = artifact_resolver
        self.verify_scope_authority = verify_scope_authority
        self.generator = generator

    async def admit(
        self, envelope: AxWiseOperationEnvelope
    ) -> TranscriptCorpusAdmittedResult:
        checked = revalidate_capability_envelope(envelope)
        if not isinstance(checked.input, AdmitTranscriptCorpusInputV1):
            raise _fail("AXWISE_INPUT_TYPE_MISMATCH")
        try:
            return await asyncio.wait_for(
                self._admit(checked), timeout=ADMISSION_DEADLINE_SECONDS
            )
        except asyncio.TimeoutError as error:
            raise _fail("AXWISE_CORPUS_ADMISSION_DEADLINE") from error

    async def _admit(
        self, envelope: AxWiseOperationEnvelope
    ) -> TranscriptCorpusAdmittedResult:
        corpus = validate_transcript_corpus(envelope.input.corpus)
        references = {
            reference.artifact_id: reference
            for document in corpus.documents
            for reference in document.origin_artifact_refs
        }
        loaded = {}
        for identity, reference in references.items():
            if reference.kind not in {"transcript_corpus", "simulation"}:
                raise _fail("AXWISE_CAPABILITY_SOURCE_KIND_UNSUPPORTED")
            fact = await resolve_owned_capability_artifact(
                self.artifact_resolver,
                envelope,
                ArtifactRef.model_validate(
                    reference.model_dump(mode="json", by_alias=True)
                ),
                kind=reference.kind,
            )
            loaded[identity] = (
                SimulationV1.model_validate(fact.payload).corpus
                if fact.kind == "simulation"
                else validate_transcript_corpus(fact.payload)
            )
        trusted_origins = {}
        for document in corpus.documents:
            for reference in document.origin_artifact_refs:
                parent = next(
                    (
                        item
                        for item in loaded[reference.artifact_id].documents
                        if item.document_id == document.document_id
                    ),
                    None,
                )
                if parent is None or _source_document_core(
                    parent
                ) != _source_document_core(document):
                    raise _fail("AXWISE_CORPUS_ORIGIN_BINDING_MISMATCH")
                trusted_origins[document.document_id] = parent.origin
        corpus = validate_transcript_corpus(corpus, trusted_origins=trusted_origins)
        artifact = _fact(
            envelope,
            kind="transcript_corpus",
            payload=corpus.model_dump(mode="json", by_alias=True),
            source_ids=list(references),
        )
        return TranscriptCorpusAdmittedResult(
            result_type="transcript_corpus_admitted",
            artifact=artifact,
            metrics=CapabilityOperationMetrics(
                latency_ms=0,
                budget_scope="invocation",
                model_calls=0,
                usage_complete=True,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                search_calls=0,
                estimated_cost_micros=0,
            ),
        )

    async def analyze(
        self, envelope: AxWiseOperationEnvelope
    ) -> EvidenceAnalyzedResult:
        started = time.monotonic()
        checked = revalidate_capability_envelope(envelope)
        if not isinstance(checked.input, AnalyzeEvidenceInputV1):
            raise _fail("AXWISE_INPUT_TYPE_MISMATCH")
        limits = effective_capability_limits(checked.input.limits, ANALYSIS_POLICY)
        deadline = started + limits.deadline_ms / 1000
        try:
            return await asyncio.wait_for(
                self._analyze(checked, limits=limits, deadline=deadline),
                timeout=max(0, deadline - time.monotonic()),
            )
        except asyncio.TimeoutError as error:
            raise _fail("AXWISE_ANALYSIS_DEADLINE") from error

    async def _analyze(
        self,
        envelope: AxWiseOperationEnvelope,
        *,
        limits: CapabilityLimitsV1,
        deadline: float,
    ) -> EvidenceAnalyzedResult:
        input_value = envelope.input
        scope_fact = await resolve_owned_capability_artifact(
            self.artifact_resolver, envelope, input_value.accepted_scope, kind="scope"
        )
        if canonical_json(scope_fact.payload) != canonical_json(
            input_value.scope.model_dump(mode="json", by_alias=True)
        ):
            raise _fail("AXWISE_ACCEPTED_SCOPE_MISMATCH")
        scope = ScopeArtifactV2.model_validate(scope_fact.payload)
        self.verify_scope_authority(
            scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        source_fact = await resolve_owned_capability_artifact(
            self.artifact_resolver,
            envelope,
            input_value.source.artifact,
            kind=input_value.source.artifact.kind,
        )
        if canonical_json(source_fact.payload) != canonical_json(
            input_value.source.payload
        ):
            raise _fail("AXWISE_CORPUS_ARTIFACT_MISMATCH")
        corpus = (
            SimulationV1.model_validate(source_fact.payload).corpus
            if source_fact.kind == "simulation"
            else validate_transcript_corpus(source_fact.payload)
        )
        request = validate_analysis_request(input_value.request, corpus)
        context = AnalysisGenerationContext(
            corpus=corpus,
            request=request,
            accepted_scope=CorpusArtifactRefV1.model_validate(
                input_value.accepted_scope.model_dump(mode="json", by_alias=True)
            ),
            source_artifacts=(
                CorpusArtifactRefV1.model_validate(
                    input_value.source.artifact.model_dump(mode="json", by_alias=True)
                ),
            ),
            operation_id=envelope.operation_id,
            processing_permit=issue_processing_permit(
                envelope,
                provider_payload=analysis_generation_payload(corpus, request),
                deadline=deadline,
            ),
        )
        if self.generator is None:
            # Transcript-to-provider processing requires separately authorized
            # production wiring. The default executor has no analysis generator.
            raise _fail("AXWISE_ANALYSIS_GENERATION_DISABLED")
        if time.monotonic() >= deadline:
            raise _fail("AXWISE_ANALYSIS_DEADLINE")
        try:
            generated = await self.generator.analyze(
                context, limits=limits, deadline=deadline
            )
        except CognitiveExecutionFailure:
            raise
        except asyncio.TimeoutError:
            raise
        except (TypeError, ValueError, OverflowError) as error:
            raise _fail("AXWISE_ANALYSIS_INVALID_OUTPUT") from error
        except Exception as error:
            raise _fail("AXWISE_ANALYSIS_GENERATION_FAILED", retryable=True) from error
        current = asyncio.current_task()
        if current is not None and current.cancelling():
            # A provider coroutine cannot turn a suppressed cancellation into
            # a successful artifact, even when it returns a valid candidate.
            raise asyncio.CancelledError
        if time.monotonic() >= deadline:
            raise _fail("AXWISE_ANALYSIS_DEADLINE")
        try:
            if type(generated) is not AnalysisGenerationResult:
                raise ValueError("analysis generator returned an invalid receipt")
            if generated.provider is not None and (
                type(generated.provider) is not str or generated.provider != "google"
            ):
                raise ValueError("analysis generator provider is not supported")
            if (
                type(generated.model_calls) is not int
                or not 1 <= generated.model_calls <= limits.max_model_calls
            ):
                raise ValueError("analysis model-call budget was not established")
            for value, maximum in (
                (generated.input_tokens, limits.max_input_tokens),
                (generated.output_tokens, limits.max_output_tokens),
            ):
                if value is not None and (
                    type(value) is not int or not 0 <= value <= maximum
                ):
                    raise ValueError(
                        "analysis provider usage exceeds its admitted limit"
                    )
            analysis = materialize_analysis(
                generated.candidate,
                corpus=corpus,
                request=request,
                accepted_scope=context.accepted_scope,
                source_artifacts=context.source_artifacts,
            )
            artifact = _fact(
                envelope,
                kind="qualitative_analysis",
                payload=analysis.model_dump(mode="json", by_alias=True),
                source_ids=[
                    input_value.accepted_scope.artifact_id,
                    source_fact.artifact_id,
                ],
            )
            metrics = CapabilityOperationMetrics(
                latency_ms=0,
                budget_scope="invocation",
                provider=generated.provider,
                model=generated.model,
                model_calls=generated.model_calls,
                usage_complete=(
                    generated.input_tokens is not None
                    and generated.output_tokens is not None
                ),
                input_tokens=generated.input_tokens,
                output_tokens=generated.output_tokens,
                total_tokens=(
                    generated.input_tokens + generated.output_tokens
                    if generated.input_tokens is not None
                    and generated.output_tokens is not None
                    else None
                ),
                search_calls=0,
                model_version=generated.model_version,
            )
            completed = EvidenceAnalyzedResult(
                result_type="evidence_analyzed", artifact=artifact, metrics=metrics
            )
            if time.monotonic() >= deadline:
                raise _fail("AXWISE_ANALYSIS_DEADLINE")
            if current is not None and current.cancelling():
                raise asyncio.CancelledError
            return completed
        except (TypeError, ValueError, OverflowError) as error:
            raise _fail("AXWISE_ANALYSIS_INVALID_OUTPUT") from error


__all__ = [
    "ANALYSIS_POLICY",
    "AnalysisGenerator",
    "AnalysisGenerationContext",
    "AnalysisGenerationResult",
    "AnalysisOperationHandler",
    "resolve_owned_capability_artifact",
    "revalidate_capability_envelope",
]
