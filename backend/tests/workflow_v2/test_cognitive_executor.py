from __future__ import annotations

import hashlib
import json
from uuid import UUID

import httpx
import pytest
from pydantic import BaseModel
from pydantic_ai import Agent, PromptedOutput

import backend.services.workflow_v2.cognitive_executor as cognitive_executor_module
from backend.domain.workflow_v2.contracts import (
    ArtifactFact,
    ArtifactRef,
    AxWiseOperationEnvelope,
    artifact_content_hash,
    canonical_hash,
)
from backend.services.workflow_v2.cognitive_executor import (
    DraftSpan,
    DraftTopicAnchor,
    GeminiCognitiveExecutor,
    ModelOutput,
    PydanticAIScopeDrafter,
    PydanticAIScopeReviser,
    PydanticAISynthesisWriter,
    ScopeDraft,
    ScopeRevisionDraft,
    SynthesisContext,
    SynthesisDraft,
    _operation_metrics,
    _usage_from_result,
    _usage_from_search,
    _validate_synthesis,
    has_positive_launch_readiness_claim,
)
from backend.services.llm import gemini_runtime
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.worker_main import cost_configuration_ready


REQUEST = "Create an Estonia cat-food launch PRD."
AUTHORITY_KEY = b"a" * 32
pytestmark = pytest.mark.contract


def compile_input() -> dict:
    return {
        "type": "CompileScopeV2",
        "request": REQUEST,
        "objectiveOnlyContext": [],
        "safeDefaults": {
            "geography": [],
            "acceptedSourceTypes": [],
            "assumptions": [],
            "limits": [],
            "policies": [],
        },
    }


def envelope_for(
    input_payload: dict | None = None,
    *,
    operation_id: str = "00000000-0000-4000-8000-000000000001",
    operation_type: str = "CompileScopeV2",
) -> AxWiseOperationEnvelope:
    value = input_payload or compile_input()
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": operation_id,
            "operationType": operation_type,
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000002",
                "organizationId": None,
                "userId": "user_axwisetest123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000003",
                "stageId": "00000000-0000-4000-8000-000000000004",
                "stageAttemptId": "00000000-0000-4000-8000-000000000005",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(value),
            "input": value,
        }
    )


class FakeDrafter:
    def __init__(
        self,
        *,
        criticality: str = "blocking",
        claim_type: str = "legal_safety",
        assumptions: list[str] | None = None,
        evidence: bool = True,
    ) -> None:
        self.criticality = criticality
        self.claim_type = claim_type
        self.assumptions = assumptions or []
        self.evidence = evidence

    async def draft(self, _input_value, objective_context):
        assert objective_context == []
        topic_start = REQUEST.index("cat-food")
        requirements = []
        if self.evidence:
            requirements.append(
                {
                    "id": "food-safety-law",
                    "claimType": self.claim_type,
                    "description": "Verify applicable pet-food safety obligations.",
                    "criticality": self.criticality,
                    "appliesWhen": "The deliverable recommends an Estonia launch.",
                    "acceptedSourceTypes": ["government", "primary_law"],
                }
            )
        return ModelOutput(
            ScopeDraft(
                objective=REQUEST,
                objective_source_spans=[DraftSpan(start=0, end=len(REQUEST))],
                topic_anchors=[
                    DraftTopicAnchor(
                        value="cat-food",
                        source_spans=[
                            DraftSpan(
                                start=topic_start,
                                end=topic_start + len("cat-food"),
                            )
                        ],
                    )
                ],
                geography=["Estonia"],
                evidence_requirements=requirements,
                deliverables=["Product requirements document"],
                prd_requirements=["Label evidence gaps at claim level"],
                assumptions=self.assumptions,
            ),
            input_tokens=11,
            output_tokens=13,
        )


class Resolver:
    def __init__(self, *facts: ArtifactFact) -> None:
        self.facts = {fact.artifact_id: fact for fact in facts}

    def artifact_fact(self, _tenant_id, artifact_id):
        fact = self.facts.get(artifact_id)
        return fact.model_dump(mode="json", by_alias=True) if fact else None


def ref(fact: ArtifactFact) -> dict:
    return {
        "artifactId": str(fact.artifact_id),
        "artifactHash": fact.artifact_hash,
        "kind": fact.kind,
    }


def test_complex_outputs_use_provider_compatible_prompted_transport(monkeypatch) -> None:
    captured = []

    class CapturingAgent:
        def __init__(self, **kwargs):
            captured.append(type(kwargs["output_type"]).__name__)

        def output_validator(self, function):
            return function

    monkeypatch.setattr(cognitive_executor_module, "Agent", CapturingAgent)
    PydanticAIScopeDrafter(object())
    PydanticAIScopeReviser(object())
    PydanticAISynthesisWriter(object())

    assert captured == ["PromptedOutput", "PromptedOutput", "PromptedOutput"]


@pytest.mark.asyncio
async def test_pydantic_ai_228_usage_property_preserves_thought_tokens_and_cost(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class UsageProbe(BaseModel):
        value: str

    captured_requests: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append((str(request.url), json.loads(request.content)))
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": '{"value":"ok"}'}],
                            "role": "model",
                        },
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 10,
                    "candidatesTokenCount": 5,
                    "thoughtsTokenCount": 7,
                    "totalTokenCount": 22,
                },
                "modelVersion": "gemini-3.7-flash",
            },
        )

    def client_factory(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.7-flash")
    monkeypatch.setenv("GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS", "750000")
    monkeypatch.setenv("GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "3750000")
    monkeypatch.setattr(gemini_runtime, "BoundedRetryAsyncClient", client_factory)
    await gemini_runtime.close_shared_research_models()
    try:
        model = gemini_runtime.get_shared_workflow_model("usage-property-test-key")
        result = await Agent(
            model=model,
            output_type=PromptedOutput(UsageProbe),
        ).run("usage probe")

        assert callable(result.usage) is False
        assert result.usage.input_tokens == 10
        assert result.usage.output_tokens == 12
        assert result.usage.output_reasoning_tokens == 7
        assert result.usage.total_tokens == 22
        assert result.usage.details["thoughts_tokens"] == 7
        input_tokens, output_tokens = _usage_from_result(result)
        assert (input_tokens, output_tokens) == (10, 12)
        metrics = _operation_metrics(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
        assert metrics.total_tokens == 22
        assert metrics.estimated_cost_micros == 52

        assert len(captured_requests) == 1
        url, body = captured_requests[0]
        assert url.endswith("/v1beta/models/gemini-3.7-flash:generateContent")
        config = body["generationConfig"]
        assert config["thinkingConfig"] == {"thinking_level": "HIGH"}
        assert "maxOutputTokens" not in config
        assert "temperature" not in config
        assert "topP" not in config
        assert "topK" not in config
        assert "candidateCount" not in config
    finally:
        await gemini_runtime.close_shared_research_models()


def test_grounded_usage_prices_tool_thought_tokens_and_provider_queries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    usage = _usage_from_search(
        {
            "usage_metadata": {
                "promptTokenCount": 10,
                "toolUsePromptTokenCount": 3,
                "candidatesTokenCount": 5,
                "thoughtsTokenCount": 7,
                "totalTokenCount": 25,
            },
            "provider_queries": ["query one", "query two", "query three"],
            "runtime_diagnostics": {"call_count": 2, "retry_count": 1},
        }
    )

    assert usage == (13, 12, 25, 3)
    monkeypatch.setenv("GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS", "750000")
    monkeypatch.setenv("GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "3750000")
    monkeypatch.setenv("GEMINI_SEARCH_COST_MICROS_PER_QUERY", "14000")
    metrics = _operation_metrics(
        input_tokens=usage[0],
        output_tokens=usage[1],
        total_tokens=usage[2],
        search_calls=usage[3],
    )
    assert metrics.search_calls == 3
    assert metrics.estimated_cost_micros == 42_054


def test_worker_readiness_requires_nonnegative_search_query_rate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_INPUT_COST_MICROS_PER_MILLION_TOKENS", "750000")
    monkeypatch.setenv("GEMINI_OUTPUT_COST_MICROS_PER_MILLION_TOKENS", "3750000")
    monkeypatch.setenv("GEMINI_SEARCH_COST_MICROS_PER_QUERY", "14000")
    assert cost_configuration_ready() is True

    monkeypatch.delenv("GEMINI_SEARCH_COST_MICROS_PER_QUERY")
    assert cost_configuration_ready() is False
    monkeypatch.setenv("GEMINI_SEARCH_COST_MICROS_PER_QUERY", "-1")
    assert cost_configuration_ready() is False


@pytest.mark.asyncio
async def test_compile_scope_seals_exact_spans_hashes_discriminator_and_metrics() -> None:
    executor = GeminiCognitiveExecutor(FakeDrafter(), AUTHORITY_KEY)
    result = await executor.execute(envelope_for())
    scope = result.artifact.payload
    span = scope["topicAnchors"][0]["sourceSpans"][0]

    assert result.result_type == "scope_compiled"
    assert span["text"] == "cat-food"
    assert span["offsetUnit"] == "utf16_code_units"
    assert span["sha256"] == hashlib.sha256(b"cat-food").hexdigest()
    assert result.artifact.artifact_hash == artifact_content_hash(
        content_type="application/json", payload=scope, markdown=None
    )
    assert scope["authority"]["canonicalInputHash"] == envelope_for().canonical_input_hash
    assert len(scope["authority"]["seal"]) == 64
    assert result.metrics.latency_ms >= 1
    assert result.metrics.input_tokens == 11
    assert result.metrics.output_tokens == 13
    assert result.metrics.total_tokens == 24


@pytest.mark.asyncio
async def test_compile_scope_rejects_uncited_topic_fallback() -> None:
    class InvalidDrafter(FakeDrafter):
        async def draft(self, input_value, objective_context):
            output = await super().draft(input_value, objective_context)
            output.value.topic_anchors[0].value = "dog-food"
            return output

    with pytest.raises(ValueError, match="not literal cited input"):
        await GeminiCognitiveExecutor(InvalidDrafter(), AUTHORITY_KEY).execute(
            envelope_for()
        )


@pytest.mark.asyncio
async def test_revise_scope_replaces_topic_and_invalidates_research_identity() -> None:
    compiled = await GeminiCognitiveExecutor(FakeDrafter(), AUTHORITY_KEY).execute(
        envelope_for()
    )
    correction = "Change the product to dog-food while keeping Estonia and the PRD."
    topic_start = correction.index("dog-food")
    correction_input = {
        "type": "ReviseScopeV2",
        "acceptedScope": ref(compiled.artifact),
        "correction": correction,
        "correctionSourceSpans": [
            {
                "start": 0,
                "end": len(correction),
                "offsetUnit": "utf16_code_units",
                "text": correction,
                "sha256": hashlib.sha256(correction.encode("utf-8")).hexdigest(),
            }
        ],
    }

    class Reviser:
        async def revise(self, _input_value, accepted_scope):
            return ScopeRevisionDraft(
                objective_changed=True,
                objective="Create an Estonia dog-food launch PRD.",
                objective_source_spans=[DraftSpan(start=0, end=len(correction))],
                topic_changed=True,
                topic_anchors=[
                    DraftTopicAnchor(
                        value="dog-food",
                        source_spans=[
                            DraftSpan(
                                start=topic_start, end=topic_start + len("dog-food")
                            )
                        ],
                    )
                ],
                geography=list(accepted_scope.geography),
                evidence_requirements=list(accepted_scope.evidence_requirements),
                deliverables=list(accepted_scope.deliverables),
                personas=list(accepted_scope.personas),
                interview_requirements=list(accepted_scope.interview_requirements),
                prd_requirements=list(accepted_scope.prd_requirements),
                limits=list(accepted_scope.limits),
                policies=list(accepted_scope.policies),
                assumptions=list(accepted_scope.assumptions),
            )

    executor = GeminiCognitiveExecutor(
        FakeDrafter(),
        AUTHORITY_KEY,
        artifact_resolver=Resolver(compiled.artifact),
        scope_reviser=Reviser(),
    )
    revised_result = await executor.execute(
        envelope_for(
            correction_input,
            operation_id="00000000-0000-4000-8000-000000000021",
            operation_type="ReviseScopeV2",
        )
    )
    revised = revised_result.artifact.payload

    assert [topic["value"] for topic in revised["topicAnchors"]] == ["dog-food"]
    assert revised["researchInputHash"] != compiled.artifact.payload["researchInputHash"]
    assert revised_result.artifact.source_artifact_ids == [compiled.artifact.artifact_id]


class MissingResearchRunner:
    def __init__(self) -> None:
        self.queries = []

    async def search(self, query):
        self.queries.append(query)
        return {
            "search_performed": True,
            "text": "",
            "claims": [],
            "sources": [],
            "provider_queries": [f"provider query {len(self.queries)}"],
            "usage_metadata": {"inputTokens": 3, "outputTokens": 2},
            "runtime_diagnostics": {"callCount": 1},
        }


class TransientFailureRunner:
    async def search(self, _query):
        return {
            "search_performed": False,
            "runtime_diagnostics": {"status": "retry_exhausted", "call_count": 3},
        }


class VerifiedResearchRunner:
    async def search(self, _query):
        text = "Estonian law requires registered pet-food operators."
        url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=example"
        return {
            "search_performed": True,
            "text": text,
            "claims": [{"text": text, "source_urls": [url]}],
            "sources": [{"title": "Estonian regulation", "url": url}],
            "provider_queries": [
                "Estonian pet-food operator law",
                "EU animal-feed regulation",
                "Estonian feed register",
            ],
            "usage_metadata": {
                "promptTokenCount": 5,
                "candidatesTokenCount": 7,
                "thoughtsTokenCount": 3,
                "toolUsePromptTokenCount": 2,
                "totalTokenCount": 17,
            },
            "runtime_diagnostics": {"call_count": 2, "retry_count": 1},
        }


class UngroundedConflictRunner(VerifiedResearchRunner):
    async def search(self, query):
        result = await super().search(query)
        result["conflicts"] = [
            "An ungrounded model assertion says the authoritative source conflicts."
        ]
        return result


class DeceptiveBlogRunner:
    async def search(self, _query):
        text = "A blog claims a new regulation applies."
        url = "https://news.example.test/new-regulation"
        return {
            "search_performed": True,
            "text": text,
            "claims": [{"text": text, "source_urls": [url]}],
            "sources": [
                {
                    "title": "Government ministry regulation and legal gazette",
                    "url": url,
                    "source_type": "primary_law",
                }
            ],
            "runtime_diagnostics": {"call_count": 1},
        }


async def compiled_scope(
    *,
    criticality: str = "blocking",
    claim_type: str = "legal_safety",
    assumptions: list[str] | None = None,
    evidence: bool = True,
):
    return await GeminiCognitiveExecutor(
        FakeDrafter(
            criticality=criticality,
            claim_type=claim_type,
            assumptions=assumptions,
            evidence=evidence,
        ),
        AUTHORITY_KEY,
    ).execute(envelope_for())


def research_operation(compiled, *, selected_evidence: list[ArtifactFact] | None = None):
    selected = selected_evidence or []
    input_payload = {
        "type": "ExecuteResearchV2",
        "acceptedScope": ref(compiled.artifact),
        "scope": compiled.artifact.payload,
        "selectedEvidence": [ref(item) for item in selected],
    }
    return envelope_for(
        input_payload,
        operation_id="00000000-0000-4000-8000-000000000031",
        operation_type="ExecuteResearchV2",
    )


async def execute_research(compiled, runner, *extra_facts):
    executor = GeminiCognitiveExecutor(
        FakeDrafter(),
        AUTHORITY_KEY,
        runner,
        Resolver(compiled.artifact, *extra_facts),
    )
    return await executor.execute(
        research_operation(compiled, selected_evidence=list(extra_facts))
    )


@pytest.mark.asyncio
async def test_optional_gap_repairs_once_and_delivers_non_launch_ready_result() -> None:
    compiled = await compiled_scope(
        criticality="nonblocking", claim_type="market_statistic"
    )
    runner = MissingResearchRunner()
    result = await execute_research(compiled, runner)

    assert result.result_type == "research_completed"
    assert result.evidence_readiness == "ready_with_gaps"
    assert result.artifact.payload["launchReady"] is False
    assert result.artifact.payload["boundedRepairPasses"] == 1
    assert len(runner.queries) == 2
    assert all(REQUEST not in query for query in runner.queries)
    assert all("cat-food" in query and "Estonia" in query for query in runner.queries)
    finding = result.artifact.payload["findings"][0]
    assert str(result.artifact.artifact_id) in finding["sourceArtifactIds"]
    assert result.metrics.search_calls == 2
    assert result.metrics.input_tokens == 6
    assert result.metrics.output_tokens == 4
    assert result.metrics.total_tokens == 10


@pytest.mark.asyncio
async def test_unresolved_essential_evidence_blocks_but_transient_failure_is_not_gap() -> None:
    compiled = await compiled_scope()
    blocked = await execute_research(compiled, MissingResearchRunner())
    assert blocked.evidence_readiness == "blocked"
    assert blocked.artifact.payload["launchReady"] is False

    with pytest.raises(CognitiveExecutionFailure) as raised:
        await execute_research(compiled, TransientFailureRunner())
    assert raised.value.error_class == "AXWISE_RESEARCH_RETRY_EXHAUSTED"
    assert raised.value.retryable is True


@pytest.mark.asyncio
async def test_verified_grounding_has_exact_claim_provenance_and_usage() -> None:
    compiled = await compiled_scope()
    result = await execute_research(compiled, VerifiedResearchRunner())
    ledger = result.artifact.payload["claimLedger"]

    assert result.evidence_readiness == "ready"
    assert len(ledger) == 1
    claim = ledger[0]["claims"][0]
    response = ledger[0]["providerResponseText"].encode("utf-8")
    assert response[claim["segmentStart"] : claim["segmentEnd"]].decode() == claim["text"]
    assert claim["providerResponseHash"] == ledger[0]["providerResponseHash"]
    assert result.metrics.input_tokens == 7
    assert result.metrics.output_tokens == 10
    assert result.metrics.total_tokens == 17
    assert result.metrics.search_calls == 3


@pytest.mark.asyncio
async def test_ungrounded_conflict_text_cannot_override_verified_legal_evidence() -> None:
    compiled = await compiled_scope()
    result = await execute_research(compiled, UngroundedConflictRunner())

    assert result.evidence_readiness == "ready"
    assert result.artifact.payload["conflicts"] == []
    assert result.artifact.payload["findings"][0]["status"] == "verified"


@pytest.mark.asyncio
async def test_deceptive_blog_title_and_metadata_cannot_become_primary_law() -> None:
    compiled = await compiled_scope()
    result = await execute_research(compiled, DeceptiveBlogRunner())

    assert result.evidence_readiness == "blocked"
    assert result.artifact.payload["findings"][0]["status"] == "missing"
    assert all(
        entry["claims"] == [] for entry in result.artifact.payload["claimLedger"]
    )


@pytest.mark.asyncio
async def test_only_typed_selected_evidence_can_establish_not_applicable() -> None:
    compiled = await compiled_scope()
    payload = {
        "schemaVersion": "axwise.evidence.v1",
        "requirementId": "food-safety-law",
        "applicability": "not_applicable",
        "claims": [],
        "conflicts": [],
    }
    evidence = ArtifactFact(
        artifactId="00000000-0000-4000-8000-000000000039",
        artifactHash=artifact_content_hash(
            content_type="application/json", payload=payload, markdown=None
        ),
        kind="evidence",
        contentType="application/json",
        payload=payload,
        markdown=None,
        sourceArtifactIds=[],
    )
    runner = MissingResearchRunner()
    result = await execute_research(compiled, runner, evidence)

    assert runner.queries == []
    assert result.artifact.payload["findings"][0]["status"] == "not_applicable"
    assert result.evidence_readiness == "ready"


@pytest.mark.asyncio
async def test_scope_assumption_never_yields_launch_ready() -> None:
    compiled = await compiled_scope(
        assumptions=["Pricing is an unverified owner assumption."], evidence=False
    )
    result = await execute_research(compiled, MissingResearchRunner())

    assert result.evidence_readiness == "ready_with_gaps"
    assert result.artifact.payload["launchReady"] is False
    assert result.artifact.payload["assumptions"] == [
        "Pricing is an unverified owner assumption."
    ]


def artifact_ref(
    artifact_id: str, kind: str, content_type: str, payload: dict, markdown=None
) -> tuple[dict, dict]:
    reference = {
        "artifactId": artifact_id,
        "artifactHash": artifact_content_hash(
            content_type=content_type, payload=payload, markdown=markdown
        ),
        "kind": kind,
    }
    return reference, {
        "artifact": reference,
        "contentType": content_type,
        "payload": payload,
        "markdown": markdown,
    }


def task_core() -> dict:
    core = {
        "stageId": "00000000-0000-4000-8000-000000000044",
        "stageKey": "deliverable-1",
        "title": "Product requirements document",
        "dependsOnStageKeys": [],
        "agentId": None,
        "toolIds": [],
        "budgetCents": 0,
        "dataBoundary": [],
    }
    return {**core, "inputHash": canonical_hash(core)}


@pytest.mark.asyncio
async def test_synthesis_validates_exact_plan_task_evaluation_contents_and_gaps() -> None:
    compiled = await compiled_scope(
        criticality="nonblocking", claim_type="market_statistic"
    )
    research = await execute_research(compiled, MissingResearchRunner())
    scope_ref = ref(compiled.artifact)
    research_ref = ref(research.artifact)
    task = task_core()
    plan_core = {
        "schemaVersion": "orqaly.plan.v2",
        "acceptedScopeArtifact": scope_ref,
        "researchArtifact": research_ref,
        "selectedAgent": None,
        "tasks": [task],
    }
    plan_payload = {**plan_core, "planHash": canonical_hash(plan_core)}
    plan_ref, plan_content = artifact_ref(
        "00000000-0000-4000-8000-000000000043",
        "plan",
        "application/json",
        plan_payload,
    )
    task_sources = sorted(
        [scope_ref, research_ref, plan_ref], key=lambda item: item["artifactId"]
    )
    task_markdown = "# Product requirements document\n\nTask evidence details."
    task_payload = {
        "schemaVersion": "orqaly.task-result.v2",
        "task": task,
        "acceptedScope": scope_ref,
        "research": research_ref,
        "acceptedPlan": plan_ref,
        "title": task["title"],
        "markdown": task_markdown,
        "evidenceReadiness": "ready_with_gaps",
        "sourceArtifacts": task_sources,
        "requirements": {
            "personas": [],
            "interviews": [],
            "prd": ["Label evidence gaps at claim level"],
        },
        "evidence": [
            {
                "requirementId": finding["requirementId"],
                "status": finding["status"],
                "note": finding["note"],
                "claimIds": [],
            }
            for finding in research.artifact.payload["findings"]
        ],
        "executionReceipt": {
            "agent": None,
            "toolIds": [],
            "budgetCents": 0,
            "dataBoundary": [],
        },
        "conclusions": ["Prepared the accepted PRD deliverable."],
        "unknowns": list(research.artifact.payload["gaps"]),
    }
    task_ref, task_content = artifact_ref(
        "00000000-0000-4000-8000-000000000045",
        "task_result",
        "text/markdown",
        task_payload,
        task_markdown,
    )
    evaluation_payload = {
        "schemaVersion": "orqaly.evaluation.v1",
        "taskArtifacts": [task_ref],
        "evidenceReadiness": "ready_with_gaps",
        "outputContractSatisfied": False,
        "promotedArtifact": None,
        "note": "Final synthesis is required.",
    }
    evaluation_ref, evaluation_content = artifact_ref(
        "00000000-0000-4000-8000-000000000046",
        "evaluation",
        "application/json",
        evaluation_payload,
    )
    synth_input = {
        "type": "SynthesizeArtifactV1",
        "acceptedScope": scope_ref,
        "research": research_ref,
        "acceptedPlan": plan_ref,
        "taskArtifacts": [task_ref],
        "evaluation": evaluation_ref,
        "artifactContents": [plan_content, task_content, evaluation_content],
        "outputContract": {
            "format": "text/markdown",
            "requiredSections": ["Product requirements document"],
            "evidenceReadiness": "ready_with_gaps",
        },
    }

    class Writer:
        async def write(self, _input, _scope, research_payload, selected_contents):
            assert [item.artifact.kind for item in selected_contents] == [
                "plan",
                "task_result",
                "evaluation",
            ]
            gaps = [
                *research_payload["assumptions"],
                *research_payload["gaps"],
                *research_payload["conflicts"],
            ]
            return SynthesisDraft(
                title="Estonia cat-food PRD",
                markdown=(
                    "# Product requirements document\n\nUseful PRD content.\n\n"
                    "## Evidence gaps\n\n" + "\n".join(gaps)
                ),
            )

    executor = GeminiCognitiveExecutor(
        FakeDrafter(),
        AUTHORITY_KEY,
        artifact_resolver=Resolver(compiled.artifact, research.artifact),
        synthesis_writer=Writer(),
    )
    result = await executor.execute(
        envelope_for(
            synth_input,
            operation_id="00000000-0000-4000-8000-000000000047",
            operation_type="SynthesizeArtifactV1",
        )
    )

    assert result.result_type == "artifact_synthesized"
    assert result.evidence_readiness == "ready_with_gaps"
    assert result.artifact.kind == "final_markdown"
    assert result.artifact.payload["launchReady"] is False
    assert result.artifact.markdown == result.artifact.payload["markdown"]
    assert result.artifact.source_artifact_ids == sorted(
        [
            compiled.artifact.artifact_id,
            research.artifact.artifact_id,
            UUID(plan_ref["artifactId"]),
            UUID(task_ref["artifactId"]),
            UUID(evaluation_ref["artifactId"]),
        ],
        key=str,
    )


def test_ready_with_gaps_validator_rejects_launch_claim_even_with_gap_section() -> None:
    context = SynthesisContext(
        required_sections=["PRD"],
        evidence_readiness="ready_with_gaps",
        allowed_claim_ids=[],
        required_gap_labels=["Optional statistic is missing."],
    )
    draft = SynthesisDraft(
        title="Unsafe claim",
        markdown=(
            "# PRD\n\nThis is launch-ready.\n\n## Evidence gaps\n\n"
            "Optional statistic is missing."
        ),
    )
    with pytest.raises(ValueError, match="launch-ready"):
        _validate_synthesis(context, draft)


@pytest.mark.parametrize(
    ("markdown", "expected"),
    [
        ("This artifact is launch-ready.", True),
        ("This artifact is launch‑ready.", True),
        ("This artifact is **launch-ready**.", True),
        ("The product is ready to launch.", True),
        ("The product is ready **for launch**.", True),
        ("Production readiness has been confirmed.", True),
        ("Launch readiness: confirmed.", True),
        ("All launch requirements have been met.", True),
        ("Market entry may now proceed.", True),
        ("There are no blockers to launch.", True),
        ("Go-live is approved.", True),
        ("Launch is authorised.", True),
        ("The product has launch clearance.", True),
        ("We have the green light to launch.", True),
        ("There is nothing preventing launch.", True),
        ("The plan can be released to production.", True),
        ("Production deployment has been approved.", True),
        ("The evidence is not complete, but this plan is market ready.", True),
        ("The evidence is not complete, although this plan is market ready.", True),
        (
            "This does not waive the gaps; nevertheless, it is approved for launch.",
            True,
        ),
        ("Although legal approval is pending, the plan is launch-ready.", True),
        ("This artifact is not launch-ready.", False),
        ("We cannot consider this production ready.", False),
        ("Without claiming market readiness, this remains useful.", False),
        ("Launch readiness has not been established.", False),
        ("If legal review passes, launch can proceed.", False),
        ("Launch may proceed only after legal clearance.", False),
        ("This would be launch-ready once safety evidence is verified.", False),
        ("The plan can be released to production only after legal approval.", False),
        ("Pending legal approval, the plan may go live.", False),
        ("No launch clearance has been granted.", False),
    ],
)
def test_launch_readiness_guard_has_clause_local_parity(
    markdown: str, expected: bool
) -> None:
    assert has_positive_launch_readiness_claim(markdown) is expected


@pytest.mark.parametrize(
    "claim",
    [
        "Go-live is approved.",
        "The product has launch clearance.",
        "We have the green light to launch.",
        "There is nothing preventing launch.",
        "The plan can be released to production.",
    ],
)
def test_ready_with_gaps_validator_rejects_launch_euphemisms(claim: str) -> None:
    context = SynthesisContext(
        required_sections=["PRD"],
        evidence_readiness="ready_with_gaps",
        allowed_claim_ids=[],
        required_gap_labels=["Optional statistic is missing."],
    )
    draft = SynthesisDraft(
        title="Unsafe claim",
        markdown=(
            f"# PRD\n\n{claim}\n\n## Evidence gaps\n\n"
            "Optional statistic is missing."
        ),
    )
    with pytest.raises(ValueError, match="launch-ready"):
        _validate_synthesis(context, draft)
