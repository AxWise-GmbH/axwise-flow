from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Generic, Literal, Protocol, TypeVar
from urllib.parse import urlparse
from uuid import NAMESPACE_URL, UUID, uuid5

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent, ModelRetry, PromptedOutput, RunContext

from backend.domain.workflow_v2.contracts import (
    ArtifactFact,
    ArtifactRef,
    ArtifactSynthesizedResult,
    AxWiseOperationEnvelope,
    CompileScopeInputV2,
    EvidenceAcquisitionPassV1,
    EvidenceClaimV1,
    EvidenceRequirement,
    EvidenceFinding,
    EvaluationResultV1,
    ExecuteResearchInputV2,
    FinalArtifactV1,
    FinalMarkdownArtifactFact,
    ImmutableArtifactContent,
    OperationMetrics,
    PlanningResultV2,
    ResearchResultV2,
    ResearchCompletedResult,
    ResearchArtifactFact,
    ReviseScopeInputV2,
    ScopeArtifactV2,
    ScopeArtifactFact,
    ScopeAuthority,
    ScopeCompiledResult,
    SelectedEvidenceArtifactV1,
    SourceSpan,
    TopicAnchor,
    SynthesizeArtifactInputV1,
    TaskResultV2,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
    utf16_length,
    utf16_ordinal_sorted,
    utf16_slice,
)
from backend.services.llm.gemini_runtime import get_shared_workflow_model
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


class _DraftModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DraftSpan(_DraftModel):
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class DraftTopicAnchor(_DraftModel):
    value: str = Field(min_length=1, max_length=300)
    source_spans: list[DraftSpan] = Field(min_length=1, max_length=12)


class ScopeDraft(_DraftModel):
    objective: str = Field(min_length=1, max_length=6000)
    objective_source_spans: list[DraftSpan] = Field(min_length=1, max_length=24)
    topic_anchors: list[DraftTopicAnchor] = Field(min_length=1, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=12)
    deliverables: list[str] = Field(min_length=1, max_length=24)
    personas: list[str] = Field(default_factory=list, max_length=24)
    interview_requirements: list[str] = Field(default_factory=list, max_length=24)
    prd_requirements: list[str] = Field(default_factory=list, max_length=40)
    limits: list[str] = Field(default_factory=list, max_length=40)
    policies: list[str] = Field(default_factory=list, max_length=40)
    assumptions: list[str] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(default=None, min_length=1, max_length=1000)


class ScopeDraftContext(_DraftModel):
    request: str


TModelOutput = TypeVar("TModelOutput")


@dataclass(frozen=True)
class ModelOutput(Generic[TModelOutput]):
    value: TModelOutput
    input_tokens: int = 0
    output_tokens: int = 0


class ScopeDrafter(Protocol):
    async def draft(
        self, input_value: CompileScopeInputV2, objective_context: list[str]
    ) -> ModelOutput[ScopeDraft] | ScopeDraft: ...


class ScopeRevisionDraft(_DraftModel):
    objective_changed: bool
    objective: str | None = Field(default=None, min_length=1, max_length=6000)
    objective_source_spans: list[DraftSpan] = Field(default_factory=list, max_length=24)
    topic_changed: bool
    topic_anchors: list[DraftTopicAnchor] = Field(default_factory=list, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=12)
    deliverables: list[str] = Field(min_length=1, max_length=24)
    personas: list[str] = Field(default_factory=list, max_length=24)
    interview_requirements: list[str] = Field(default_factory=list, max_length=24)
    prd_requirements: list[str] = Field(default_factory=list, max_length=40)
    limits: list[str] = Field(default_factory=list, max_length=40)
    policies: list[str] = Field(default_factory=list, max_length=40)
    assumptions: list[str] = Field(default_factory=list, max_length=24)
    material_clarification: str | None = Field(default=None, min_length=1, max_length=1000)


class ScopeRevisionContext(_DraftModel):
    correction: str


class ScopeReviser(Protocol):
    async def revise(
        self, input_value: ReviseScopeInputV2, accepted_scope: ScopeArtifactV2
    ) -> ModelOutput[ScopeRevisionDraft] | ScopeRevisionDraft: ...


class ResearchRunner(Protocol):
    async def search(self, query: str) -> dict[str, Any]: ...


class ArtifactResolver(Protocol):
    def artifact_fact(self, tenant_id: UUID, artifact_id: UUID) -> dict[str, Any] | None: ...


class SynthesisDraft(_DraftModel):
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)


class SynthesisContext(_DraftModel):
    required_sections: list[str]
    evidence_readiness: str
    allowed_claim_ids: list[str]
    required_gap_labels: list[str]


class SynthesisWriter(Protocol):
    async def write(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft] | SynthesisDraft: ...


SCOPE_SYSTEM_PROMPT = """
Compile one concise accepted-scope proposal from only REQUEST_TEXT, typed SAFE_DEFAULTS,
and the bounded objective strings in OBJECTIVE_CONTEXT. REQUEST_TEXT is authoritative over
conflicting defaults or context. Return exact zero-based UTF-16 code-unit offsets into
REQUEST_TEXT for every objective/topic source span.
Topic anchors must be literal text found inside their cited spans. Never infer a topic
when the request does not state it. The accepted scope is the sole future research
authority: include geography, evidence requirements, deliverables, personas/interviews,
PRD requirements, limits, and policies here. Evidence requirements must be claim-specific;
mark only essential legal/safety evidence as blocking. Optional statistics, offers, or
commercial details are nonblocking. Return at most one truly material clarification,
never a questionnaire. Emit every acceptedSourceTypes array sorted and unique using only
the closed source vocabulary. Use one identical quality contract. Do not expose unrelated
context.
""".strip()


def _validate_draft(request: str, draft: ScopeDraft) -> None:
    spans = [*draft.objective_source_spans]
    for topic in draft.topic_anchors:
        spans.extend(topic.source_spans)
        cited = " ".join(
            utf16_slice(request, span.start, span.end) for span in topic.source_spans
        )
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(f"topic anchor {topic.value!r} is not literal cited input")
    for span in spans:
        utf16_slice(request, span.start, span.end)


def _usage_from_result(result: Any) -> tuple[int, int]:
    usage_value = result.usage() if callable(getattr(result, "usage", None)) else None
    return (
        int(getattr(usage_value, "input_tokens", 0) or 0),
        int(getattr(usage_value, "output_tokens", 0) or 0),
    )


def _unwrap_model_output(
    value: ModelOutput[TModelOutput] | TModelOutput,
) -> tuple[TModelOutput, int, int]:
    if isinstance(value, ModelOutput):
        return value.value, value.input_tokens, value.output_tokens
    return value, 0, 0


def _estimated_cost_micros(input_tokens: int, output_tokens: int) -> int | None:
    input_rate = os.getenv("GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS")
    output_rate = os.getenv("GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS")
    if input_rate is None or output_rate is None:
        return None
    try:
        numerator = input_tokens * int(input_rate) + output_tokens * int(output_rate)
        if int(input_rate) < 0 or int(output_rate) < 0:
            return None
    except ValueError:
        return None
    return max(0, numerator // 1_000_000)


def _operation_metrics(
    *,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int | None = None,
    search_calls: int = 0,
) -> OperationMetrics:
    return OperationMetrics(
        latency_ms=0,
        provider="google",
        model="gemini-3.7-flash",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=(
            input_tokens + output_tokens if total_tokens is None else total_tokens
        ),
        search_calls=search_calls,
        estimated_cost_micros=_estimated_cost_micros(input_tokens, output_tokens),
    )


class PydanticAIScopeDrafter:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeDraftContext,
            output_type=PromptedOutput(ScopeDraft),
            system_prompt=SCOPE_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[ScopeDraftContext], output: ScopeDraft
        ) -> ScopeDraft:
            try:
                _validate_draft(ctx.deps.request, output)
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    async def draft(
        self, input_value: CompileScopeInputV2, objective_context: list[str]
    ) -> ModelOutput[ScopeDraft]:
        prompt = canonical_json(
            {
                "REQUEST_TEXT": input_value.request,
                "SAFE_DEFAULTS": input_value.safe_defaults.model_dump(
                    mode="json", by_alias=True
                ),
                "OBJECTIVE_CONTEXT": objective_context,
            }
        )
        result = await self.agent.run(
            prompt,
            deps=ScopeDraftContext(request=input_value.request),
        )
        _validate_draft(input_value.request, result.output)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(result.output, input_tokens, output_tokens)


SCOPE_REVISION_SYSTEM_PROMPT = """
Revise the exact ACCEPTED_SCOPE using only OWNER_CORRECTION. The correction is
authoritative over conflicting prior fields; preserve every non-conflicting field.
Set topic_changed only when the correction changes the research topic. When true,
return a complete replacement topic-anchor list, cite every topic with exact zero-based
UTF-16 code-unit offsets into OWNER_CORRECTION, and do not retain stale topic anchors. When false,
return no topic anchors; the server preserves the accepted anchors. Apply the same rule
to objective_changed and objective offsets. Return all other semantic lists as their
complete revised values. Never use chat history or unrelated context. Evidence
requirements remain claim-specific; only essential legal/safety evidence may block.
Emit every acceptedSourceTypes array sorted and unique using the closed source vocabulary.
""".strip()


def _validate_revision_draft(correction: str, draft: ScopeRevisionDraft) -> None:
    if draft.objective_changed:
        if not draft.objective or not draft.objective_source_spans:
            raise ValueError("changed objective requires correction-backed objective spans")
    elif draft.objective is not None or draft.objective_source_spans:
        raise ValueError("unchanged objective must not be regenerated")
    if draft.topic_changed:
        if not draft.topic_anchors:
            raise ValueError("changed topic requires replacement topic anchors")
    elif draft.topic_anchors:
        raise ValueError("unchanged topic must not be regenerated")
    spans = [*draft.objective_source_spans]
    for topic in draft.topic_anchors:
        spans.extend(topic.source_spans)
        cited = " ".join(
            utf16_slice(correction, span.start, span.end) for span in topic.source_spans
        )
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(f"topic anchor {topic.value!r} is not literal cited correction")
    for span in spans:
        utf16_slice(correction, span.start, span.end)


class PydanticAIScopeReviser:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeRevisionContext,
            output_type=PromptedOutput(ScopeRevisionDraft),
            system_prompt=SCOPE_REVISION_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[ScopeRevisionContext], output: ScopeRevisionDraft
        ) -> ScopeRevisionDraft:
            try:
                _validate_revision_draft(ctx.deps.correction, output)
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    async def revise(
        self, input_value: ReviseScopeInputV2, accepted_scope: ScopeArtifactV2
    ) -> ModelOutput[ScopeRevisionDraft]:
        prompt = canonical_json(
            {
                "ACCEPTED_SCOPE": accepted_scope.model_dump(mode="json", by_alias=True),
                "OWNER_CORRECTION": input_value.correction,
                "CORRECTION_SOURCE_SPANS": [
                    item.model_dump(mode="json", by_alias=True)
                    for item in input_value.correction_source_spans
                ],
            }
        )
        result = await self.agent.run(
            prompt,
            deps=ScopeRevisionContext(correction=input_value.correction),
        )
        _validate_revision_draft(input_value.correction, result.output)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(result.output, input_tokens, output_tokens)


SYNTHESIS_SYSTEM_PROMPT = """
Write one useful final Markdown artifact from the accepted scope and immutable research
result, accepted plan, task results and evaluation supplied. Do not use chat history or
infer facts outside the claim ledger. Every factual evidence claim must carry its exact
``[evidence:<claim-id>]`` marker from ALLOWED_CLAIM_IDS. Clearly label assumptions and
evidence gaps at claim level. If evidence readiness is not ready, never claim launch,
production, market, legal or safety readiness. Satisfy every required section as a Markdown
heading. Return typed title and Markdown only.
""".strip()


def _validate_synthesis(context: SynthesisContext, draft: SynthesisDraft) -> None:
    folded = draft.markdown.casefold()
    headings = [
        match.group(1).strip().casefold()
        for match in re.finditer(r"(?m)^#{1,6}\s+(.+?)\s*$", draft.markdown)
    ]
    missing = [
        section
        for section in context.required_sections
        if section.strip().casefold() not in headings
    ]
    if missing:
        raise ValueError("required Markdown sections are missing: " + ", ".join(missing))
    if context.evidence_readiness != "ready" and re.search(
        r"\b(?:launch[- ]ready|ready for launch|fully validated|production[- ]ready|"
        r"market[- ]ready|cleared for launch|safe to launch|legally cleared)\b",
        folded,
    ):
        raise ValueError("evidence-gapped artifact contains a launch-ready claim")
    citations = set(re.findall(r"\[evidence:([a-f0-9]{64})\]", draft.markdown))
    allowed = set(context.allowed_claim_ids)
    if citations - allowed:
        raise ValueError("Markdown cites evidence outside the immutable claim ledger")
    if allowed and not citations:
        raise ValueError("evidence-backed Markdown must cite immutable claim IDs")
    if context.evidence_readiness == "ready_with_gaps":
        if not any(
            "evidence gap" in heading or "assumption" in heading for heading in headings
        ):
            raise ValueError(
                "ready_with_gaps Markdown requires an Evidence gaps or Assumptions section"
            )
        missing_gaps = [
            label for label in context.required_gap_labels if label.casefold() not in folded
        ]
        if missing_gaps:
            raise ValueError("Markdown does not surface every immutable gap or assumption")


class PydanticAISynthesisWriter:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=PromptedOutput(SynthesisDraft),
            system_prompt=SYNTHESIS_SYSTEM_PROMPT,
            retries={"output": 2},
        )

        @self.agent.output_validator
        async def validate_output(
            ctx: RunContext[SynthesisContext], output: SynthesisDraft
        ) -> SynthesisDraft:
            try:
                _validate_synthesis(ctx.deps, output)
            except ValueError as error:
                raise ModelRetry(str(error)) from error
            return output

    async def write(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
        selected_contents: list[ImmutableArtifactContent],
    ) -> ModelOutput[SynthesisDraft]:
        allowed_claim_ids = sorted(
            {
                claim["claimId"]
                for entry in research_payload.get("claimLedger", [])
                for claim in entry.get("claims", [])
            }
        )
        context = SynthesisContext(
            required_sections=input_value.output_contract.required_sections,
            evidence_readiness=input_value.output_contract.evidence_readiness,
            allowed_claim_ids=allowed_claim_ids,
            required_gap_labels=[
                *research_payload.get("assumptions", []),
                *research_payload.get("gaps", []),
                *research_payload.get("conflicts", []),
            ],
        )
        prompt = canonical_json(
            {
                "ACCEPTED_SCOPE": scope_payload,
                "RESEARCH_RESULT": research_payload,
                "SELECTED_IMMUTABLE_ARTIFACTS": [
                    item.model_dump(mode="json", by_alias=True)
                    for item in selected_contents
                ],
                "ALLOWED_CLAIM_IDS": allowed_claim_ids,
            }
        )
        result = await self.agent.run(prompt, deps=context)
        _validate_synthesis(context, result.output)
        input_tokens, output_tokens = _usage_from_result(result)
        return ModelOutput(result.output, input_tokens, output_tokens)


def _source_span(request: str, draft: DraftSpan) -> SourceSpan:
    text = utf16_slice(request, draft.start, draft.end)
    return SourceSpan(
        start=draft.start,
        end=draft.end,
        text=text,
        sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


def _artifact_fact(
    *,
    artifact_id: UUID,
    kind: str,
    payload: dict[str, Any],
    source_artifact_ids: list[UUID],
    markdown: str | None = None,
) -> ArtifactFact:
    content_type = "text/markdown" if markdown is not None else "application/json"
    fact_type: type[ArtifactFact]
    if kind == "scope":
        fact_type = ScopeArtifactFact
    elif kind == "research":
        fact_type = ResearchArtifactFact
    elif kind == "final_markdown":
        fact_type = FinalMarkdownArtifactFact
    else:
        fact_type = ArtifactFact
    return fact_type(
        artifact_id=artifact_id,
        artifact_hash=artifact_content_hash(
            content_type=content_type,
            payload=payload,
            markdown=markdown,
        ),
        kind=kind,
        content_type=content_type,
        payload=payload,
        markdown=markdown,
        source_artifact_ids=sorted(set(source_artifact_ids), key=str),
    )


def _validated_resolved_artifact(
    fact: dict[str, Any] | None,
    reference: ArtifactRef,
    *,
    expected_kind: str,
    error_class: str,
) -> ArtifactFact:
    if fact is None:
        raise CognitiveExecutionFailure(error_class, retryable=False)
    try:
        artifact = ArtifactFact.model_validate(fact)
    except ValueError as error:
        raise CognitiveExecutionFailure(error_class, retryable=False) from error
    if (
        artifact.artifact_id != reference.artifact_id
        or artifact.artifact_hash != reference.artifact_hash
        or artifact.kind != reference.kind
        or artifact.kind != expected_kind
    ):
        raise CognitiveExecutionFailure(error_class, retryable=False)
    return artifact


def _authority_payload(
    *,
    tenant_id: UUID,
    artifact_id: UUID,
    canonical_input_hash: str,
    research_input_hash: str,
) -> str:
    return canonical_json(
        {
            "tenantId": str(tenant_id),
            "artifactId": str(artifact_id),
            "canonicalInputHash": canonical_input_hash,
            "researchInputHash": research_input_hash,
        }
    )


class GeminiGroundedResearchRunner:
    def __init__(self, api_key: str) -> None:
        from backend.services.generative.gemini_search_service import GeminiSearchService

        self.service = GeminiSearchService(api_key=api_key)

    async def search(self, query: str) -> dict[str, Any]:
        return await asyncio.to_thread(self.service.search_web_general, query)

    async def close(self) -> None:
        await asyncio.to_thread(self.service.close)


def _scope_semantics_payload(
    *,
    topic_anchors: list[TopicAnchor],
    geography: list[str],
    evidence_requirements: list[EvidenceRequirement],
    deliverables: list[str],
    personas: list[str],
    interview_requirements: list[str],
    prd_requirements: list[str],
    limits: list[str],
    policies: list[str],
) -> dict[str, Any]:
    return {
        "topicAnchors": [item.model_dump(mode="json", by_alias=True) for item in topic_anchors],
        "geography": geography,
        "evidenceRequirements": [
            item.model_dump(mode="json", by_alias=True) for item in evidence_requirements
        ],
        "deliverables": deliverables,
        "personas": personas,
        "interviewRequirements": interview_requirements,
        "prdRequirements": prd_requirements,
        "limits": limits,
        "policies": policies,
    }


def _normalized_source_type(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")


def _classify_source_types(url: str, title: str) -> set[str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").casefold()
    path = (parsed.path or "").casefold()
    host_and_path = f"{host} {path}"
    types = {"grounded_web"}
    government_host = bool(
        host.endswith(".gov")
        or re.search(r"(?:^|\.)gov\.[a-z]{2,3}$", host)
        or host == "europa.eu"
        or host.endswith(".europa.eu")
    )
    if government_host:
        types.add("government")
    if host == "eur-lex.europa.eu" or (
        government_host
        and any(
            marker in host_and_path
            for marker in ("legislation", "legal", "law", "regulation", "statute")
        )
    ):
        types.add("primary_law")
    if (
        host.endswith(".edu")
        or re.search(r"(?:^|\.)ac\.[a-z]{2,3}$", host)
        or host == "doi.org"
        or host.endswith(".doi.org")
    ):
        types.add("academic")
    if government_host and any(
        marker in host_and_path for marker in ("statistics", "statistik", "eurostat", "census")
    ):
        types.add("official_statistics")
    if host in {"iso.org", "www.iso.org", "iec.ch", "www.iec.ch"}:
        types.add("standard")
    if any(
        marker in f"{host} {title}".casefold()
        for marker in ("association", "industry", "trade body")
    ):
        types.add("industry")
    return types


def _claim_from_grounding(
    raw_claim: dict[str, Any],
    source_by_url: dict[str, dict[str, Any]],
    accepted_source_types: set[str],
    expected_response_hash: str,
    provider_response_text: str,
) -> EvidenceClaimV1 | None:
    text = raw_claim.get("text")
    urls = [str(value) for value in raw_claim.get("source_urls", []) if value]
    if not isinstance(text, str) or not text.strip() or not urls:
        return None
    source_types: set[str] = set()
    for url in urls:
        source = source_by_url.get(url, {})
        source_types.update(_classify_source_types(url, str(source.get("title") or "")))
    if accepted_source_types and not source_types.intersection(accepted_source_types):
        return None
    ordered_urls = utf16_ordinal_sorted(set(urls))
    ordered_types = utf16_ordinal_sorted(source_types)
    identity = canonical_hash(
        {"text": text, "sourceTypes": ordered_types, "sourceUrls": ordered_urls}
    )
    response_bytes = provider_response_text.encode("utf-8")
    claim_bytes = text.encode("utf-8")
    first = response_bytes.find(claim_bytes)
    second = response_bytes.find(claim_bytes, first + 1) if first >= 0 else -1
    if first < 0 or second >= 0:
        return None
    span_start = first
    span_end = first + len(claim_bytes)
    return EvidenceClaimV1(
        claim_id=identity,
        text=text,
        text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        source_urls=ordered_urls,
        source_types=ordered_types,
        provider_response_hash=expected_response_hash,
        segment_start=span_start,
        segment_end=span_end,
        offset_unit="utf8_bytes",
    )


def _usage_from_search(result: dict[str, Any]) -> tuple[int, int, int, int]:
    usage = result.get("usage_metadata") or {}
    diagnostics = result.get("runtime_diagnostics") or {}

    def first_int(source: Any, *keys: str) -> int:
        if not isinstance(source, dict):
            return 0
        for key in keys:
            value = source.get(key)
            if value is not None:
                try:
                    return max(0, int(value))
                except (TypeError, ValueError):
                    return 0
        return 0

    input_tokens = first_int(
        usage,
        "input_tokens",
        "inputTokens",
        "prompt_token_count",
        "promptTokenCount",
    )
    output_tokens = first_int(
        usage,
        "output_tokens",
        "outputTokens",
        "candidates_token_count",
        "candidatesTokenCount",
    )
    total_tokens = first_int(
        usage,
        "total_tokens",
        "totalTokens",
        "total_token_count",
        "totalTokenCount",
    )
    return (
        input_tokens,
        output_tokens,
        total_tokens or input_tokens + output_tokens,
        first_int(diagnostics, "call_count", "callCount"),
    )


class GeminiCognitiveExecutor:
    def __init__(
        self,
        scope_drafter: ScopeDrafter,
        authority_key: bytes,
        research_runner: ResearchRunner | None = None,
        artifact_resolver: ArtifactResolver | None = None,
        synthesis_writer: SynthesisWriter | None = None,
        scope_reviser: ScopeReviser | None = None,
    ) -> None:
        if len(authority_key) < 32:
            raise RuntimeError("AXWISE_AUTHORITY_SEAL_KEY must contain at least 32 bytes")
        self.scope_drafter = scope_drafter
        self.authority_key = authority_key
        self.research_runner = research_runner
        self.artifact_resolver = artifact_resolver
        self.synthesis_writer = synthesis_writer
        self.scope_reviser = scope_reviser

    async def close(self) -> None:
        close = getattr(self.research_runner, "close", None)
        if callable(close):
            await close()

    async def execute(self, envelope: AxWiseOperationEnvelope):
        started = time.monotonic()
        deadline_seconds = max(
            30, min(int(os.getenv("AXWISE_COGNITIVE_DEADLINE_SECONDS", "540")), 900)
        )
        try:
            result = await asyncio.wait_for(
                self._execute_operation(envelope), timeout=deadline_seconds
            )
        except asyncio.TimeoutError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_OPERATION_DEADLINE", retryable=True
            ) from error
        latency_ms = max(1, round((time.monotonic() - started) * 1000))
        metrics = result.metrics or OperationMetrics(latency_ms=latency_ms)
        return result.model_copy(
            update={"metrics": metrics.model_copy(update={"latency_ms": latency_ms})}
        )

    async def _execute_operation(
        self, envelope: AxWiseOperationEnvelope
    ):
        if envelope.operation_type == "ReviseScopeV2":
            if not isinstance(envelope.input, ReviseScopeInputV2):
                raise CognitiveExecutionFailure("AXWISE_INPUT_TYPE_MISMATCH", retryable=False)
            return await self._revise_scope(envelope, envelope.input)
        if envelope.operation_type == "ExecuteResearchV2":
            if not isinstance(envelope.input, ExecuteResearchInputV2):
                raise CognitiveExecutionFailure("AXWISE_INPUT_TYPE_MISMATCH", retryable=False)
            return await self._execute_research(envelope, envelope.input)
        if envelope.operation_type == "SynthesizeArtifactV1":
            if not isinstance(envelope.input, SynthesizeArtifactInputV1):
                raise CognitiveExecutionFailure("AXWISE_INPUT_TYPE_MISMATCH", retryable=False)
            return await self._synthesize(envelope, envelope.input)
        if envelope.operation_type != "CompileScopeV2":
            raise CognitiveExecutionFailure("AXWISE_OPERATION_NOT_IMPLEMENTED", retryable=False)
        input_value = envelope.input
        if not isinstance(input_value, CompileScopeInputV2):
            raise CognitiveExecutionFailure("AXWISE_INPUT_TYPE_MISMATCH", retryable=False)
        objective_context: list[str] = []
        if input_value.objective_only_context:
            if self.artifact_resolver is None:
                raise CognitiveExecutionFailure(
                    "AXWISE_CONTEXT_RESOLUTION_UNAVAILABLE", retryable=True
                )
            for reference in input_value.objective_only_context:
                fact = await asyncio.to_thread(
                    self.artifact_resolver.artifact_fact,
                    envelope.owner.tenant_id,
                    reference.artifact_id,
                )
                if fact is None:
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_NOT_FOUND", retryable=False
                    )
                try:
                    context_artifact = ArtifactFact.model_validate(fact)
                except ValueError as error:
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_INVALID", retryable=False
                    ) from error
                if (
                    context_artifact.artifact_id != reference.artifact_id
                    or context_artifact.artifact_hash != reference.artifact_hash
                    or context_artifact.kind != reference.kind
                ):
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_NOT_FOUND", retryable=False
                    )
                payload = context_artifact.payload
                objective = payload.get("objective")
                if not isinstance(objective, str) or not objective.strip():
                    raise CognitiveExecutionFailure(
                        "AXWISE_OBJECTIVE_CONTEXT_INVALID", retryable=False
                    )
                objective_context.append(objective)
        drafted = await self.scope_drafter.draft(input_value, objective_context)
        draft, input_tokens, output_tokens = _unwrap_model_output(drafted)
        _validate_draft(input_value.request, draft)
        objective_spans = [
            _source_span(input_value.request, span) for span in draft.objective_source_spans
        ]
        topic_anchors = [
            TopicAnchor(
                value=topic.value,
                source_spans=[
                    _source_span(input_value.request, span) for span in topic.source_spans
                ],
            )
            for topic in draft.topic_anchors
        ]
        semantic_payload = _scope_semantics_payload(
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=draft.evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=draft.policies,
        )
        research_input_hash = canonical_hash(semantic_payload)
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        seal_payload = _authority_payload(
            tenant_id=envelope.owner.tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=envelope.canonical_input_hash,
            research_input_hash=research_input_hash,
        )
        seal = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        scope = ScopeArtifactV2(
            objective=draft.objective,
            objective_source_spans=objective_spans,
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=draft.evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=draft.policies,
            assumptions=draft.assumptions,
            material_clarification=draft.material_clarification,
            research_input_hash=research_input_hash,
            authority=ScopeAuthority(
                canonical_input_hash=envelope.canonical_input_hash,
                seal=seal,
            ),
        )
        payload = scope.model_dump(mode="json", by_alias=True)
        return ScopeCompiledResult(
            result_type="scope_compiled",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="scope",
                payload=payload,
                source_artifact_ids=[],
            ),
            metrics=_operation_metrics(
                input_tokens=input_tokens, output_tokens=output_tokens
            ),
        )

    async def _revise_scope(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: ReviseScopeInputV2,
    ):
        if self.artifact_resolver is None or self.scope_reviser is None:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_REVISION_UNAVAILABLE", retryable=True)
        fact = await asyncio.to_thread(
            self.artifact_resolver.artifact_fact,
            envelope.owner.tenant_id,
            input_value.accepted_scope.artifact_id,
        )
        resolved_scope = _validated_resolved_artifact(
            fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        payload = resolved_scope.payload
        try:
            accepted_scope = ScopeArtifactV2.model_validate(payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SCOPE_ARTIFACT_INVALID", retryable=False
            ) from error
        self._verify_scope_authority(
            accepted_scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        revised = await self.scope_reviser.revise(input_value, accepted_scope)
        draft, input_tokens, output_tokens = _unwrap_model_output(revised)
        _validate_revision_draft(input_value.correction, draft)
        objective = draft.objective if draft.objective_changed else accepted_scope.objective
        objective_spans = (
            [_source_span(input_value.correction, span) for span in draft.objective_source_spans]
            if draft.objective_changed
            else accepted_scope.objective_source_spans
        )
        topic_anchors = (
            [
                TopicAnchor(
                    value=topic.value,
                    source_spans=[
                        _source_span(input_value.correction, span)
                        for span in topic.source_spans
                    ],
                )
                for topic in draft.topic_anchors
            ]
            if draft.topic_changed
            else accepted_scope.topic_anchors
        )
        semantic_payload = _scope_semantics_payload(
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=draft.evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=draft.policies,
        )
        research_input_hash = canonical_hash(semantic_payload)
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        seal_payload = _authority_payload(
            tenant_id=envelope.owner.tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=envelope.canonical_input_hash,
            research_input_hash=research_input_hash,
        )
        seal = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        revised_scope = ScopeArtifactV2(
            objective=objective,
            objective_source_spans=objective_spans,
            topic_anchors=topic_anchors,
            geography=draft.geography,
            evidence_requirements=draft.evidence_requirements,
            deliverables=draft.deliverables,
            personas=draft.personas,
            interview_requirements=draft.interview_requirements,
            prd_requirements=draft.prd_requirements,
            limits=draft.limits,
            policies=draft.policies,
            assumptions=draft.assumptions,
            material_clarification=draft.material_clarification,
            research_input_hash=research_input_hash,
            authority=ScopeAuthority(
                canonical_input_hash=envelope.canonical_input_hash,
                seal=seal,
            ),
        )
        revised_payload = revised_scope.model_dump(mode="json", by_alias=True)
        return ScopeCompiledResult(
            result_type="scope_compiled",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="scope",
                payload=revised_payload,
                source_artifact_ids=[input_value.accepted_scope.artifact_id],
            ),
            metrics=_operation_metrics(
                input_tokens=input_tokens, output_tokens=output_tokens
            ),
        )

    def _verify_scope_authority(
        self, scope: ScopeArtifactV2, *, tenant_id: UUID, artifact_id: UUID
    ) -> None:
        semantics = _scope_semantics_payload(
            topic_anchors=scope.topic_anchors,
            geography=scope.geography,
            evidence_requirements=scope.evidence_requirements,
            deliverables=scope.deliverables,
            personas=scope.personas,
            interview_requirements=scope.interview_requirements,
            prd_requirements=scope.prd_requirements,
            limits=scope.limits,
            policies=scope.policies,
        )
        if canonical_hash(semantics) != scope.research_input_hash:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_SEMANTICS_CHANGED", retryable=False)
        seal_payload = _authority_payload(
            tenant_id=tenant_id,
            artifact_id=artifact_id,
            canonical_input_hash=scope.authority.canonical_input_hash,
            research_input_hash=scope.research_input_hash,
        )
        expected = hmac.new(
            self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, scope.authority.seal):
            raise CognitiveExecutionFailure("AXWISE_SCOPE_AUTHORITY_INVALID", retryable=False)

    async def _execute_research(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: ExecuteResearchInputV2,
    ):
        if self.research_runner is None or self.artifact_resolver is None:
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_UNAVAILABLE", retryable=True)
        scope_fact = await asyncio.to_thread(
            self.artifact_resolver.artifact_fact,
            envelope.owner.tenant_id,
            input_value.accepted_scope.artifact_id,
        )
        resolved_scope = _validated_resolved_artifact(
            scope_fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        if resolved_scope.content_type != "application/json":
            raise CognitiveExecutionFailure("AXWISE_SCOPE_ARTIFACT_HASH_CHANGED", retryable=False)
        persisted_scope_payload = resolved_scope.payload
        embedded_scope_payload = input_value.scope.model_dump(mode="json", by_alias=True)
        if (
            not isinstance(persisted_scope_payload, dict)
            or canonical_json(persisted_scope_payload) != canonical_json(embedded_scope_payload)
        ):
            raise CognitiveExecutionFailure("AXWISE_ACCEPTED_SCOPE_MISMATCH", retryable=False)
        scope = ScopeArtifactV2.model_validate(persisted_scope_payload)
        self._verify_scope_authority(
            scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:research")

        requirement_by_id = {item.id: item for item in scope.evidence_requirements}
        selected: dict[str, list[tuple[ArtifactRef, SelectedEvidenceArtifactV1]]] = {}
        for reference in input_value.selected_evidence:
            fact = await asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                reference.artifact_id,
            )
            try:
                resolved_evidence = _validated_resolved_artifact(
                    fact,
                    reference,
                    expected_kind="evidence",
                    error_class="AXWISE_SELECTED_EVIDENCE_NOT_FOUND",
                )
            except CognitiveExecutionFailure:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_NOT_FOUND", retryable=False
                )
            if resolved_evidence.content_type != "application/json":
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_NOT_FOUND", retryable=False
                )
            try:
                evidence = SelectedEvidenceArtifactV1.model_validate(resolved_evidence.payload)
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_INVALID", retryable=False
                ) from error
            if evidence.requirement_id not in requirement_by_id:
                raise CognitiveExecutionFailure(
                    "AXWISE_SELECTED_EVIDENCE_REQUIREMENT_UNKNOWN", retryable=False
                )
            selected.setdefault(evidence.requirement_id, []).append((reference, evidence))

        findings_by_id: dict[str, EvidenceFinding] = {}
        source_ids_by_requirement: dict[str, list[UUID]] = {}
        to_acquire: list[EvidenceRequirement] = []
        for requirement in scope.evidence_requirements:
            evidence_items = selected.get(requirement.id, [])
            source_ids = [reference.artifact_id for reference, _item in evidence_items]
            source_ids_by_requirement[requirement.id] = source_ids
            applicability = {item.applicability for _reference, item in evidence_items}
            explicit_conflicts = [
                conflict
                for _reference, item in evidence_items
                for conflict in item.conflicts
            ]
            accepted_types = {
                _normalized_source_type(value) for value in requirement.accepted_source_types
            }
            selected_claims = [
                claim
                for _reference, item in evidence_items
                for claim in item.claims
                if {
                    _normalized_source_type(value) for value in claim.source_types
                }.intersection(accepted_types)
            ]
            blocking = requirement.criticality == "blocking"
            if len(applicability) > 1 or explicit_conflicts:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="conflicting",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=(
                        "Immutable selected evidence conflicts on applicability "
                        "or the required claim."
                    ),
                )
            elif applicability == {"not_applicable"}:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="not_applicable",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=(
                        "Immutable selected evidence establishes that this "
                        "requirement is not applicable."
                    ),
                )
            elif selected_claims:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="verified",
                    blocking=blocking,
                    source_artifact_ids=source_ids,
                    note=f"Verified by {len(selected_claims)} selected immutable claim(s).",
                )
            else:
                source_ids_by_requirement[requirement.id] = [artifact_id, *source_ids]
                to_acquire.append(requirement)

        semantics = _scope_semantics_payload(
            topic_anchors=scope.topic_anchors,
            geography=scope.geography,
            evidence_requirements=scope.evidence_requirements,
            deliverables=scope.deliverables,
            personas=scope.personas,
            interview_requirements=scope.interview_requirements,
            prd_requirements=scope.prd_requirements,
            limits=scope.limits,
            policies=scope.policies,
        )
        concurrency = max(1, min(int(os.getenv("AXWISE_RESEARCH_CONCURRENCY", "4")), 8))
        deadline_seconds = max(
            30, min(int(os.getenv("AXWISE_RESEARCH_DEADLINE_SECONDS", "300")), 900)
        )
        semaphore = asyncio.Semaphore(concurrency)
        deadline = asyncio.get_running_loop().time() + deadline_seconds
        ledger: list[EvidenceAcquisitionPassV1] = []
        input_tokens = 0
        output_tokens = 0
        total_tokens = 0
        search_calls = 0

        async def acquire(
            requirement: EvidenceRequirement, pass_number: Literal[0, 1]
        ) -> tuple[
            list[EvidenceClaimV1],
            list[str],
            EvidenceAcquisitionPassV1,
            int,
            int,
            int,
            int,
        ]:
            instruction = (
                "Verify the exact requirement against the accepted scope. Return grounded, "
                "attributable facts. If two accepted authoritative sources materially "
                "disagree, emit the grounded disagreement as a line beginning [CONFLICT]; "
                "otherwise emit no conflict marker."
                if pass_number == 0
                else "One targeted repair pass: find the missing accepted evidence class only."
            )
            query = instruction + "\n" + canonical_json(
                {
                    "acceptedScopeSemantics": semantics,
                    "requirement": requirement.model_dump(mode="json", by_alias=True),
                }
            )
            async with semaphore:
                raw = await self.research_runner.search(query)
            diagnostics = raw.get("runtime_diagnostics") or {}
            if not raw.get("search_performed"):
                status_value = str(diagnostics.get("status") or "acquisition_failed")
                retryable = status_value not in {"configuration_error", "non_retryable_error"}
                raise CognitiveExecutionFailure(
                    f"AXWISE_RESEARCH_{status_value.upper()}", retryable=retryable
                )
            response_text = str(raw.get("text") or "")
            response_hash = hashlib.sha256(response_text.encode("utf-8")).hexdigest()
            sources = [item for item in raw.get("sources", []) if isinstance(item, dict)]
            source_by_url = {
                str(item.get("url")): item for item in sources if item.get("url")
            }
            accepted_types = {
                _normalized_source_type(value) for value in requirement.accepted_source_types
            }
            claims_by_id: dict[str, EvidenceClaimV1] = {}
            for raw_claim in raw.get("claims", []):
                if not isinstance(raw_claim, dict):
                    continue
                claim = _claim_from_grounding(
                    raw_claim,
                    source_by_url,
                    accepted_types,
                    response_hash,
                    response_text,
                )
                if claim is not None:
                    claims_by_id[claim.claim_id] = claim
            claims = [claims_by_id[key] for key in sorted(claims_by_id)]
            conflicts = utf16_ordinal_sorted(
                {
                    claim.text[:2000]
                    for claim in claims
                    if claim.text.lstrip().startswith("[CONFLICT]")
                    and len(
                        {
                            url
                            for url in claim.source_urls
                            if _classify_source_types(
                                url,
                                str(source_by_url.get(url, {}).get("title") or ""),
                            ).intersection(accepted_types)
                        }
                    )
                    >= 2
                }
            )
            source_types_seen = utf16_ordinal_sorted(
                {
                    source_type
                    for item in sources
                    for source_type in _classify_source_types(
                        str(item.get("url") or ""), str(item.get("title") or "")
                    )
                }
            )
            entry = EvidenceAcquisitionPassV1(
                requirement_id=requirement.id,
                pass_number=pass_number,
                query_hash=hashlib.sha256(query.encode("utf-8")).hexdigest(),
                provider_response_hash=response_hash,
                provider_response_text=response_text,
                claims=claims,
                source_types_seen=source_types_seen,
            )
            usage_input, usage_output, usage_total, calls = _usage_from_search(raw)
            return (
                claims,
                conflicts,
                entry,
                usage_input,
                usage_output,
                usage_total,
                max(1, calls),
            )

        async def run_round(
            requirements: list[EvidenceRequirement], pass_number: Literal[0, 1]
        ) -> dict[str, tuple[list[EvidenceClaimV1], list[str]]]:
            nonlocal input_tokens, output_tokens, total_tokens, search_calls
            tasks = {
                asyncio.create_task(acquire(requirement, pass_number)): requirement
                for requirement in requirements
            }
            if not tasks:
                return {}
            remaining = max(0.001, deadline - asyncio.get_running_loop().time())
            done, pending = await asyncio.wait(tasks, timeout=remaining)
            for task in pending:
                task.cancel()
            if pending:
                await asyncio.gather(*pending, return_exceptions=True)
                raise CognitiveExecutionFailure(
                    "AXWISE_RESEARCH_DEADLINE", retryable=True
                )
            acquired: dict[str, tuple[list[EvidenceClaimV1], list[str]]] = {}
            for task in done:
                requirement = tasks[task]
                (
                    claims,
                    conflicts,
                    entry,
                    used_input,
                    used_output,
                    used_total,
                    used_calls,
                ) = task.result()
                ledger.append(entry)
                input_tokens += used_input
                output_tokens += used_output
                total_tokens += used_total
                search_calls += used_calls
                acquired[requirement.id] = (claims, conflicts)
            return acquired

        initial = await run_round(to_acquire, 0)
        missing_for_repair: list[EvidenceRequirement] = []
        for requirement in to_acquire:
            blocking = requirement.criticality == "blocking"
            claims, conflicts = initial.get(requirement.id, ([], []))
            if conflicts:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="conflicting",
                    blocking=blocking,
                    source_artifact_ids=source_ids_by_requirement[requirement.id],
                    note="Grounded acquisition returned conflicting evidence.",
                )
            elif claims:
                findings_by_id[requirement.id] = EvidenceFinding(
                    requirement_id=requirement.id,
                    status="verified",
                    blocking=blocking,
                    source_artifact_ids=source_ids_by_requirement[requirement.id],
                    note=(
                        f"Verified with {len(claims)} grounded claim(s) from "
                        "accepted source classes."
                    ),
                )
            else:
                missing_for_repair.append(requirement)

        if missing_for_repair and asyncio.get_running_loop().time() >= deadline:
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_DEADLINE", retryable=True)
        repair_performed = bool(missing_for_repair)
        repaired = await run_round(missing_for_repair, 1)
        for requirement in missing_for_repair:
            claims, conflicts = repaired.get(requirement.id, ([], []))
            status_value = "conflicting" if conflicts else "verified" if claims else "missing"
            note = (
                "Grounded repair returned conflicting evidence."
                if conflicts
                else f"Verified on the single repair pass with {len(claims)} grounded claim(s)."
                if claims
                else "No accepted grounded claim was available after the single repair pass."
            )
            findings_by_id[requirement.id] = EvidenceFinding(
                requirement_id=requirement.id,
                status=status_value,
                blocking=requirement.criticality == "blocking",
                source_artifact_ids=source_ids_by_requirement[requirement.id],
                note=note,
            )

        findings = [findings_by_id[item.id] for item in scope.evidence_requirements]
        requirement_order = {
            requirement.id: index
            for index, requirement in enumerate(scope.evidence_requirements)
        }
        ledger.sort(
            key=lambda entry: (
                requirement_order[entry.requirement_id],
                entry.pass_number,
            )
        )
        unresolved_blocking = [
            finding
            for finding in findings
            if finding.blocking and finding.status in {"missing", "conflicting"}
        ]
        unresolved_optional = [
            finding
            for finding in findings
            if not finding.blocking and finding.status in {"missing", "conflicting"}
        ]
        readiness = (
            "blocked"
            if unresolved_blocking
            else "ready_with_gaps"
            if unresolved_optional or scope.assumptions
            else "ready"
        )
        result = ResearchResultV2(
            accepted_scope_artifact_id=input_value.accepted_scope.artifact_id,
            accepted_scope_hash=input_value.accepted_scope.artifact_hash,
            research_input_hash=scope.research_input_hash,
            readiness=readiness,
            findings=findings,
            bounded_repair_passes=1 if repair_performed else 0,
            assumptions=list(scope.assumptions),
            gaps=[finding.note for finding in unresolved_optional],
            conflicts=[
                finding.note for finding in findings if finding.status == "conflicting"
            ],
            claim_ledger_artifact_id=artifact_id,
            claim_ledger=ledger,
            launch_ready=readiness == "ready",
        )
        payload = result.model_dump(mode="json", by_alias=True)
        return ResearchCompletedResult(
            result_type="research_completed",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="research",
                payload=payload,
                source_artifact_ids=[
                    input_value.accepted_scope.artifact_id,
                ],
            ),
            evidence_readiness=readiness,
            metrics=_operation_metrics(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=total_tokens,
                search_calls=search_calls,
            ),
        )

    async def _synthesize(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: SynthesizeArtifactInputV1,
    ):
        if self.artifact_resolver is None or self.synthesis_writer is None:
            raise CognitiveExecutionFailure("AXWISE_SYNTHESIS_UNAVAILABLE", retryable=True)
        scope_fact, research_fact = await asyncio.gather(
            asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                input_value.accepted_scope.artifact_id,
            ),
            asyncio.to_thread(
                self.artifact_resolver.artifact_fact,
                envelope.owner.tenant_id,
                input_value.research.artifact_id,
            ),
        )
        resolved_scope = _validated_resolved_artifact(
            scope_fact,
            input_value.accepted_scope,
            expected_kind="scope",
            error_class="AXWISE_SCOPE_ARTIFACT_HASH_CHANGED",
        )
        resolved_research = _validated_resolved_artifact(
            research_fact,
            input_value.research,
            expected_kind="research",
            error_class="AXWISE_RESEARCH_ARTIFACT_HASH_CHANGED",
        )
        if (
            resolved_scope.content_type != "application/json"
            or resolved_research.content_type != "application/json"
        ):
            raise CognitiveExecutionFailure("AXWISE_SYNTHESIS_SOURCE_INVALID", retryable=False)
        scope_payload = resolved_scope.payload
        research_payload = resolved_research.payload
        try:
            scope = ScopeArtifactV2.model_validate(scope_payload)
            research = ResearchResultV2.model_validate(research_payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_SOURCE_INVALID", retryable=False
            ) from error
        self._verify_scope_authority(
            scope,
            tenant_id=envelope.owner.tenant_id,
            artifact_id=input_value.accepted_scope.artifact_id,
        )
        if (
            research.accepted_scope_artifact_id != input_value.accepted_scope.artifact_id
            or research.accepted_scope_hash != input_value.accepted_scope.artifact_hash
            or research.research_input_hash != scope.research_input_hash
        ):
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_SCOPE_MISMATCH", retryable=False)
        if input_value.output_contract.evidence_readiness != research.readiness:
            raise CognitiveExecutionFailure("AXWISE_EVIDENCE_READINESS_MISMATCH", retryable=False)
        if input_value.output_contract.required_sections != scope.deliverables:
            raise CognitiveExecutionFailure(
                "AXWISE_OUTPUT_CONTRACT_SCOPE_MISMATCH", retryable=False
            )
        if (
            input_value.accepted_plan.kind != "plan"
            or input_value.evaluation.kind != "evaluation"
            or any(item.kind != "task_result" for item in input_value.task_artifacts)
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_SYNTHESIS_ARTIFACT_KIND_INVALID", retryable=False
            )

        content_by_id = {
            item.artifact.artifact_id: item for item in input_value.artifact_contents
        }
        plan_content = content_by_id[input_value.accepted_plan.artifact_id]
        evaluation_content = content_by_id[input_value.evaluation.artifact_id]
        if plan_content.content_type != "application/json":
            raise CognitiveExecutionFailure("AXWISE_ACCEPTED_PLAN_INVALID", retryable=False)
        try:
            plan = PlanningResultV2.model_validate(plan_content.payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_ACCEPTED_PLAN_INVALID", retryable=False
            ) from error
        if (
            plan.accepted_scope_artifact != input_value.accepted_scope
            or plan.research_artifact != input_value.research
        ):
            raise CognitiveExecutionFailure("AXWISE_ACCEPTED_PLAN_INVALID", retryable=False)
        plan_tasks_by_stage = {item.stage_id: item for item in plan.tasks}
        if (
            len(plan_tasks_by_stage) != len(plan.tasks)
            or len({item.stage_key for item in plan.tasks}) != len(plan.tasks)
        ):
            raise CognitiveExecutionFailure("AXWISE_ACCEPTED_PLAN_INVALID", retryable=False)
        task_contents = [content_by_id[item.artifact_id] for item in input_value.task_artifacts]
        task_results_by_stage = {}
        claims_by_requirement: dict[str, list[str]] = {}
        for entry in research.claim_ledger:
            claims_by_requirement.setdefault(entry.requirement_id, []).extend(
                claim.claim_id for claim in entry.claims
            )
        expected_evidence = [
            {
                "requirementId": finding.requirement_id,
                "status": finding.status,
                "note": finding.note,
                "claimIds": sorted(
                    set(claims_by_requirement.get(finding.requirement_id, []))
                ),
            }
            for finding in research.findings
        ]
        expected_sources = sorted(
            [
                input_value.accepted_scope,
                input_value.research,
                input_value.accepted_plan,
            ],
            key=lambda item: str(item.artifact_id),
        )
        for content in task_contents:
            if content.content_type != "text/markdown":
                raise CognitiveExecutionFailure("AXWISE_TASK_ARTIFACT_INVALID", retryable=False)
            try:
                task_result = TaskResultV2.model_validate(content.payload)
            except ValueError as error:
                raise CognitiveExecutionFailure(
                    "AXWISE_TASK_ARTIFACT_INVALID", retryable=False
                ) from error
            if (
                task_result.accepted_scope != input_value.accepted_scope
                or task_result.research != input_value.research
                or task_result.accepted_plan != input_value.accepted_plan
                or task_result.evidence_readiness != research.readiness
                or task_result.markdown != content.markdown
                or task_result.task.stage_id in task_results_by_stage
                or task_result.source_artifacts != expected_sources
                or task_result.requirements.personas != scope.personas
                or task_result.requirements.interviews != scope.interview_requirements
                or task_result.requirements.prd != scope.prd_requirements
                or [item.model_dump(mode="json", by_alias=True) for item in task_result.evidence]
                != expected_evidence
                or task_result.execution_receipt.agent != plan.selected_agent
                or task_result.execution_receipt.tool_ids != task_result.task.tool_ids
                or task_result.execution_receipt.budget_cents
                != task_result.task.budget_cents
                or task_result.execution_receipt.data_boundary
                != task_result.task.data_boundary
            ):
                raise CognitiveExecutionFailure("AXWISE_TASK_ARTIFACT_INVALID", retryable=False)
            task_results_by_stage[task_result.task.stage_id] = task_result
        if set(task_results_by_stage) != set(plan_tasks_by_stage) or any(
            task_results_by_stage[stage_id].task != plan_task
            for stage_id, plan_task in plan_tasks_by_stage.items()
        ):
            raise CognitiveExecutionFailure("AXWISE_TASK_SET_PLAN_MISMATCH", retryable=False)
        if evaluation_content.content_type != "application/json":
            raise CognitiveExecutionFailure("AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False)
        try:
            evaluation = EvaluationResultV1.model_validate(evaluation_content.payload)
        except ValueError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False
            ) from error
        if (
            evaluation.task_artifacts != input_value.task_artifacts
            or evaluation.evidence_readiness != research.readiness
            or evaluation.output_contract_satisfied is not False
            or evaluation.promoted_artifact is not None
        ):
            raise CognitiveExecutionFailure("AXWISE_EVALUATION_ARTIFACT_INVALID", retryable=False)

        selected_contents = [plan_content, *task_contents, evaluation_content]
        written = await self.synthesis_writer.write(
            input_value,
            scope.model_dump(mode="json", by_alias=True),
            research.model_dump(mode="json", by_alias=True),
            selected_contents,
        )
        draft, input_tokens, output_tokens = _unwrap_model_output(written)
        readiness = research.readiness
        _validate_synthesis(
            SynthesisContext(
                required_sections=input_value.output_contract.required_sections,
                evidence_readiness=readiness,
                allowed_claim_ids=[
                    claim.claim_id
                    for entry in research.claim_ledger
                    for claim in entry.claims
                ],
                required_gap_labels=[
                    *research.assumptions,
                    *research.gaps,
                    *research.conflicts,
                ],
            ),
            draft,
        )
        final = FinalArtifactV1(
            title=draft.title,
            markdown=draft.markdown,
            source_artifacts=[
                input_value.accepted_scope,
                input_value.research,
                input_value.accepted_plan,
                *input_value.task_artifacts,
                input_value.evaluation,
            ],
            evidence_readiness=readiness,
            launch_ready=readiness == "ready",
        )
        payload = final.model_dump(mode="json", by_alias=True)
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:final-markdown")
        return ArtifactSynthesizedResult(
            result_type="artifact_synthesized",
            artifact=_artifact_fact(
                artifact_id=artifact_id,
                kind="final_markdown",
                payload=payload,
                markdown=draft.markdown,
                source_artifact_ids=[item.artifact_id for item in final.source_artifacts],
            ),
            evidence_readiness=readiness,
            metrics=_operation_metrics(
                input_tokens=input_tokens, output_tokens=output_tokens
            ),
        )


def build_cognitive_executor(artifact_resolver: ArtifactResolver) -> GeminiCognitiveExecutor:
    api_key = os.getenv("GEMINI_API_KEY")
    authority_key = os.getenv("AXWISE_AUTHORITY_SEAL_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    if not authority_key:
        raise RuntimeError("AXWISE_AUTHORITY_SEAL_KEY is required")
    model = get_shared_workflow_model(api_key)
    return GeminiCognitiveExecutor(
        PydanticAIScopeDrafter(model),
        authority_key.encode("utf-8"),
        GeminiGroundedResearchRunner(api_key),
        artifact_resolver,
        PydanticAISynthesisWriter(model),
        PydanticAIScopeReviser(model),
    )
