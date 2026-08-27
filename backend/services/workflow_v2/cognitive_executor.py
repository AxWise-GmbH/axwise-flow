from __future__ import annotations

import hashlib
import hmac
import os
import asyncio
import re
from typing import Any, Protocol
from uuid import NAMESPACE_URL, uuid5

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent, ModelRetry, NativeOutput, RunContext

from backend.domain.workflow_v2.contracts import (
    ArtifactFact,
    AxWiseOperationEnvelope,
    CompileScopeInputV2,
    CompletionResult,
    EvidenceRequirement,
    EvidenceFinding,
    ExecuteResearchInputV2,
    FinalArtifactV1,
    ResearchResultV2,
    ReviseScopeInputV2,
    ScopeArtifactV2,
    ScopeAuthority,
    SourceSpan,
    TopicAnchor,
    SynthesizeArtifactInputV1,
    canonical_hash,
    canonical_json,
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
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=80)
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
    mode: str


class ScopeDrafter(Protocol):
    async def draft(self, input_value: CompileScopeInputV2) -> ScopeDraft: ...


class ScopeRevisionDraft(_DraftModel):
    objective_changed: bool
    objective: str | None = Field(default=None, min_length=1, max_length=6000)
    objective_source_spans: list[DraftSpan] = Field(default_factory=list, max_length=24)
    topic_changed: bool
    topic_anchors: list[DraftTopicAnchor] = Field(default_factory=list, max_length=24)
    geography: list[str] = Field(default_factory=list, max_length=24)
    evidence_requirements: list[EvidenceRequirement] = Field(max_length=80)
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
    ) -> ScopeRevisionDraft: ...


class ResearchRunner(Protocol):
    async def search(self, query: str) -> dict[str, Any]: ...


class ArtifactResolver(Protocol):
    def artifact_payload(self, artifact_id: Any) -> dict[str, Any] | None: ...


class SynthesisDraft(_DraftModel):
    title: str = Field(min_length=1, max_length=500)
    markdown: str = Field(min_length=1)


class SynthesisContext(_DraftModel):
    required_sections: list[str]
    evidence_readiness: str


class SynthesisWriter(Protocol):
    async def write(
        self,
        input_value: SynthesizeArtifactInputV1,
        scope_payload: dict[str, Any],
        research_payload: dict[str, Any],
    ) -> SynthesisDraft: ...


SCOPE_SYSTEM_PROMPT = """
Compile a concise accepted-scope proposal from only REQUEST_TEXT and SAFE_DEFAULTS.
Return exact zero-based Python string offsets for every objective/topic source span.
Topic anchors must be literal text found inside their cited spans. Never infer a topic
when the request does not state it. The accepted scope is the sole future research
authority: include geography, evidence requirements, deliverables, personas/interviews,
PRD requirements, limits, and policies here. Evidence requirements must be claim-specific;
mark only essential legal/safety evidence as blocking. Optional statistics, offers, or
commercial details are nonblocking. Simple mode uses safe defaults and at most one truly
material clarification, never a questionnaire. Do not expose unrelated context.
""".strip()


def _validate_draft(request: str, draft: ScopeDraft) -> None:
    spans = [*draft.objective_source_spans]
    for topic in draft.topic_anchors:
        spans.extend(topic.source_spans)
        cited = " ".join(request[span.start : span.end] for span in topic.source_spans)
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(f"topic anchor {topic.value!r} is not literal cited input")
    for span in spans:
        if span.end > len(request) or span.end <= span.start:
            raise ValueError("scope span is outside request text")
        if not request[span.start : span.end]:
            raise ValueError("scope span is empty")


class PydanticAIScopeDrafter:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeDraftContext,
            output_type=NativeOutput(ScopeDraft),
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

    async def draft(self, input_value: CompileScopeInputV2) -> ScopeDraft:
        prompt = canonical_json(
            {
                "REQUEST_TEXT": input_value.request,
                "MODE": input_value.mode,
                "SAFE_DEFAULTS": input_value.safe_defaults,
            }
        )
        result = await self.agent.run(
            prompt,
            deps=ScopeDraftContext(request=input_value.request, mode=input_value.mode),
        )
        _validate_draft(input_value.request, result.output)
        return result.output


SCOPE_REVISION_SYSTEM_PROMPT = """
Revise the exact ACCEPTED_SCOPE using only OWNER_CORRECTION. The correction is
authoritative over conflicting prior fields; preserve every non-conflicting field.
Set topic_changed only when the correction changes the research topic. When true,
return a complete replacement topic-anchor list, cite every topic with exact zero-based
Python offsets into OWNER_CORRECTION, and do not retain stale topic anchors. When false,
return no topic anchors; the server preserves the accepted anchors. Apply the same rule
to objective_changed and objective offsets. Return all other semantic lists as their
complete revised values. Never use chat history or unrelated context. Evidence
requirements remain claim-specific; only essential legal/safety evidence may block.
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
        cited = " ".join(correction[span.start : span.end] for span in topic.source_spans)
        if topic.value.casefold() not in cited.casefold():
            raise ValueError(f"topic anchor {topic.value!r} is not literal cited correction")
    for span in spans:
        if span.end > len(correction) or span.end <= span.start:
            raise ValueError("revision span is outside correction text")
        if not correction[span.start : span.end]:
            raise ValueError("revision span is empty")


class PydanticAIScopeReviser:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=ScopeRevisionContext,
            output_type=NativeOutput(ScopeRevisionDraft),
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
    ) -> ScopeRevisionDraft:
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
        return result.output


SYNTHESIS_SYSTEM_PROMPT = """
Write one useful final Markdown artifact from the accepted scope and immutable research
result supplied. Do not use chat history or infer facts outside the claim ledger. Clearly
label assumptions and evidence gaps at claim level. If evidence readiness is not ready,
never say launch-ready, ready for launch, fully validated, or equivalent. Satisfy every
required section. Return typed title and Markdown only.
""".strip()


def _validate_synthesis(context: SynthesisContext, draft: SynthesisDraft) -> None:
    folded = draft.markdown.casefold()
    missing = [section for section in context.required_sections if section.casefold() not in folded]
    if missing:
        raise ValueError("required Markdown sections are missing: " + ", ".join(missing))
    if context.evidence_readiness != "ready" and re.search(
        r"\b(?:launch[- ]ready|ready for launch|fully validated)\b", folded
    ):
        raise ValueError("evidence-gapped artifact contains a launch-ready claim")


class PydanticAISynthesisWriter:
    def __init__(self, model: Any) -> None:
        self.agent = Agent(
            model=model,
            deps_type=SynthesisContext,
            output_type=NativeOutput(SynthesisDraft),
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
    ) -> SynthesisDraft:
        context = SynthesisContext(
            required_sections=input_value.output_contract.required_sections,
            evidence_readiness=input_value.output_contract.evidence_readiness,
        )
        prompt = canonical_json(
            {
                "ACCEPTED_SCOPE": scope_payload,
                "RESEARCH_RESULT": research_payload,
                "SELECTED_IMMUTABLE_REFS": input_value.model_dump(
                    mode="json", by_alias=True
                ),
            }
        )
        result = await self.agent.run(prompt, deps=context)
        _validate_synthesis(context, result.output)
        return result.output


def _source_span(request: str, draft: DraftSpan) -> SourceSpan:
    text = request[draft.start : draft.end]
    return SourceSpan(
        start=draft.start,
        end=draft.end,
        text=text,
        sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


class GeminiGroundedResearchRunner:
    def __init__(self, api_key: str) -> None:
        from backend.services.generative.gemini_search_service import GeminiSearchService

        self.service = GeminiSearchService(api_key=api_key)

    async def search(self, query: str) -> dict[str, Any]:
        return await asyncio.to_thread(self.service.search_web_general, query)


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


def _is_essential_legal_safety(requirement: EvidenceRequirement) -> bool:
    normalized = f"{requirement.claim_type} {requirement.description}".casefold()
    return requirement.criticality == "blocking" and any(
        marker in normalized for marker in ("legal", "law", "safety", "regulat")
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

    async def execute(self, envelope: AxWiseOperationEnvelope) -> CompletionResult:
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
        draft = await self.scope_drafter.draft(input_value)
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
        seal_payload = canonical_json(
            {
                "canonicalInputHash": envelope.canonical_input_hash,
                "researchInputHash": research_input_hash,
            }
        )
        seal = hmac.new(self.authority_key, seal_payload.encode("utf-8"), hashlib.sha256).hexdigest()
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
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        return CompletionResult(
            artifact=ArtifactFact(
                artifact_id=artifact_id,
                artifact_hash=canonical_hash(payload),
                kind="scope",
                content_type="application/json",
                payload=payload,
                markdown=None,
                source_artifact_ids=[],
            )
        )

    async def _revise_scope(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: ReviseScopeInputV2,
    ) -> CompletionResult:
        if self.artifact_resolver is None or self.scope_reviser is None:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_REVISION_UNAVAILABLE", retryable=True)
        payload = await asyncio.to_thread(
            self.artifact_resolver.artifact_payload,
            input_value.accepted_scope.artifact_id,
        )
        if payload is None:
            raise CognitiveExecutionFailure("AXWISE_SOURCE_ARTIFACT_NOT_FOUND", retryable=False)
        if canonical_hash(payload) != input_value.accepted_scope.artifact_hash:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_ARTIFACT_HASH_CHANGED", retryable=False)
        try:
            accepted_scope = ScopeArtifactV2.model_validate(payload)
        except ValueError as error:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_ARTIFACT_INVALID", retryable=False) from error
        self._verify_scope_authority(accepted_scope)
        draft = await self.scope_reviser.revise(input_value, accepted_scope)
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
        seal_payload = canonical_json(
            {
                "canonicalInputHash": envelope.canonical_input_hash,
                "researchInputHash": research_input_hash,
            }
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
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:scope")
        return CompletionResult(
            artifact=ArtifactFact(
                artifact_id=artifact_id,
                artifact_hash=canonical_hash(revised_payload),
                kind="scope",
                content_type="application/json",
                payload=revised_payload,
                markdown=None,
                source_artifact_ids=[input_value.accepted_scope.artifact_id],
            )
        )

    def _verify_scope_authority(self, scope: ScopeArtifactV2) -> None:
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
        seal_payload = canonical_json(
            {
                "canonicalInputHash": scope.authority.canonical_input_hash,
                "researchInputHash": scope.research_input_hash,
            }
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
    ) -> CompletionResult:
        if self.research_runner is None:
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_UNAVAILABLE", retryable=True)
        scope = input_value.scope
        self._verify_scope_authority(scope)
        topic = ", ".join(anchor.value for anchor in scope.topic_anchors)
        geography = ", ".join(scope.geography) or "unspecified geography"
        findings: list[EvidenceFinding] = []
        ledger: list[dict[str, Any]] = []
        missing: list[tuple[EvidenceRequirement, dict[str, Any]]] = []

        for requirement in scope.evidence_requirements:
            query = (
                f"Topic: {topic}. Geography: {geography}. Verify this exact evidence "
                f"requirement using primary or authoritative sources: {requirement.description}"
            )
            result = await self.research_runner.search(query)
            ledger.append({"requirementId": requirement.id, "pass": 0, "result": result})
            if result.get("search_performed") and result.get("claims"):
                findings.append(
                    EvidenceFinding(
                        requirement_id=requirement.id,
                        status="verified",
                        blocking=_is_essential_legal_safety(requirement),
                        source_artifact_ids=[],
                        note=f"Verified with {len(result['claims'])} grounded claim(s).",
                    )
                )
            else:
                missing.append((requirement, result))

        repair_performed = bool(missing)
        for requirement, _first in missing:
            query = (
                f"Targeted repair for missing {requirement.claim_type} evidence. "
                f"Topic: {topic}. Geography: {geography}. Requirement: "
                f"{requirement.description}. Return only grounded, attributable facts."
            )
            repaired = await self.research_runner.search(query)
            ledger.append({"requirementId": requirement.id, "pass": 1, "result": repaired})
            verified = bool(repaired.get("search_performed") and repaired.get("claims"))
            findings.append(
                EvidenceFinding(
                    requirement_id=requirement.id,
                    status="verified" if verified else "missing",
                    blocking=_is_essential_legal_safety(requirement),
                    source_artifact_ids=[],
                    note=(
                        f"Verified on targeted repair with {len(repaired['claims'])} grounded claim(s)."
                        if verified
                        else "No grounded claim was available after one targeted repair pass."
                    ),
                )
            )

        findings.sort(key=lambda item: item.requirement_id)
        unresolved_blocking = [
            finding for finding in findings if finding.blocking and finding.status != "verified"
        ]
        unresolved_optional = [
            finding for finding in findings if not finding.blocking and finding.status != "verified"
        ]
        readiness = (
            "blocked"
            if unresolved_blocking
            else "ready_with_gaps"
            if unresolved_optional
            else "ready"
        )
        artifact_id = uuid5(NAMESPACE_URL, f"axwise:{envelope.operation_id}:research")
        result = ResearchResultV2(
            accepted_scope_artifact_id=input_value.accepted_scope.artifact_id,
            accepted_scope_hash=input_value.accepted_scope.artifact_hash,
            research_input_hash=scope.research_input_hash,
            readiness=readiness,
            findings=findings,
            bounded_repair_passes=1 if repair_performed else 0,
            assumptions=list(scope.assumptions),
            gaps=[finding.note for finding in unresolved_optional],
            conflicts=[],
            claim_ledger_artifact_id=artifact_id,
            launch_ready=readiness == "ready",
        )
        payload = result.model_dump(mode="json", by_alias=True)
        payload["claimLedger"] = ledger
        return CompletionResult(
            artifact=ArtifactFact(
                artifact_id=artifact_id,
                artifact_hash=canonical_hash(payload),
                kind="research",
                content_type="application/json",
                payload=payload,
                markdown=None,
                source_artifact_ids=[input_value.accepted_scope.artifact_id],
            ),
            evidence_readiness=readiness,
        )

    async def _synthesize(
        self,
        envelope: AxWiseOperationEnvelope,
        input_value: SynthesizeArtifactInputV1,
    ) -> CompletionResult:
        if self.artifact_resolver is None or self.synthesis_writer is None:
            raise CognitiveExecutionFailure("AXWISE_SYNTHESIS_UNAVAILABLE", retryable=True)
        scope_payload, research_payload = await asyncio.gather(
            asyncio.to_thread(
                self.artifact_resolver.artifact_payload,
                input_value.accepted_scope.artifact_id,
            ),
            asyncio.to_thread(
                self.artifact_resolver.artifact_payload,
                input_value.research.artifact_id,
            ),
        )
        if scope_payload is None or research_payload is None:
            raise CognitiveExecutionFailure("AXWISE_SOURCE_ARTIFACT_NOT_FOUND", retryable=False)
        if canonical_hash(scope_payload) != input_value.accepted_scope.artifact_hash:
            raise CognitiveExecutionFailure("AXWISE_SCOPE_ARTIFACT_HASH_CHANGED", retryable=False)
        # The research payload contains the immutable claim ledger and is hashed as one unit.
        if canonical_hash(research_payload) != input_value.research.artifact_hash:
            raise CognitiveExecutionFailure("AXWISE_RESEARCH_ARTIFACT_HASH_CHANGED", retryable=False)
        draft = await self.synthesis_writer.write(input_value, scope_payload, research_payload)
        readiness = input_value.output_contract.evidence_readiness
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
        return CompletionResult(
            artifact=ArtifactFact(
                artifact_id=artifact_id,
                artifact_hash=canonical_hash(payload),
                kind="final_markdown",
                content_type="text/markdown",
                payload=payload,
                markdown=draft.markdown,
                source_artifact_ids=[item.artifact_id for item in final.source_artifacts],
            )
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
