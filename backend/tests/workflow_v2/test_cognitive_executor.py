import hashlib
from uuid import UUID

import pytest

from backend.domain.workflow_v2.contracts import AxWiseOperationEnvelope, canonical_hash
from backend.services.workflow_v2.cognitive_executor import (
    DraftSpan,
    DraftTopicAnchor,
    GeminiCognitiveExecutor,
    ScopeDraft,
    ScopeRevisionDraft,
    SynthesisDraft,
)


REQUEST = "Create an Estonia cat-food launch PRD."
pytestmark = pytest.mark.contract


class FakeDrafter:
    async def draft(self, _input_value):
        topic_start = REQUEST.index("cat-food")
        return ScopeDraft(
            objective="Create an Estonia cat-food launch PRD.",
            objective_source_spans=[DraftSpan(start=0, end=len(REQUEST))],
            topic_anchors=[
                DraftTopicAnchor(
                    value="cat-food",
                    source_spans=[
                        DraftSpan(start=topic_start, end=topic_start + len("cat-food"))
                    ],
                )
            ],
            geography=["Estonia"],
            evidence_requirements=[
                {
                    "id": "food-safety-law",
                    "claimType": "legal_safety",
                    "description": "Verify applicable pet-food safety obligations.",
                    "criticality": "blocking",
                    "appliesWhen": "The deliverable recommends an Estonia launch.",
                    "acceptedSourceTypes": ["government", "primary_law"],
                }
            ],
            deliverables=["Product requirements document"],
            prd_requirements=["Label evidence gaps at claim level"],
        )


def envelope() -> AxWiseOperationEnvelope:
    input_payload = {
        "type": "CompileScopeV2",
        "request": REQUEST,
        "mode": "simple",
        "objectiveOnlyContext": [],
        "safeDefaults": {},
    }
    return AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000001",
            "operationType": "CompileScopeV2",
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
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )


@pytest.mark.asyncio
async def test_compile_scope_seals_exact_spans_and_immutable_hashes():
    executor = GeminiCognitiveExecutor(FakeDrafter(), b"a" * 32)
    result = await executor.execute(envelope())
    scope = result.artifact.payload
    span = scope["topicAnchors"][0]["sourceSpans"][0]

    assert span["text"] == "cat-food"
    assert span["sha256"] == hashlib.sha256(b"cat-food").hexdigest()
    assert result.artifact.artifact_hash == canonical_hash(scope)
    assert scope["authority"]["canonicalInputHash"] == envelope().canonical_input_hash
    assert len(scope["authority"]["seal"]) == 64
    assert scope["materialClarification"] is None


@pytest.mark.asyncio
async def test_compile_scope_rejects_uncited_topic_fallback():
    class InvalidDrafter(FakeDrafter):
        async def draft(self, input_value):
            draft = await super().draft(input_value)
            draft.topic_anchors[0].value = "dog-food"
            return draft

    executor = GeminiCognitiveExecutor(InvalidDrafter(), b"a" * 32)
    with pytest.raises(ValueError, match="not literal cited input"):
        await executor.execute(envelope())


@pytest.mark.asyncio
async def test_revise_scope_replaces_topic_and_invalidates_old_research_identity():
    compiled = await GeminiCognitiveExecutor(FakeDrafter(), b"a" * 32).execute(envelope())
    correction = "Change the product to dog-food while keeping Estonia and the PRD."
    topic_start = correction.index("dog-food")
    correction_hash = hashlib.sha256(correction.encode("utf-8")).hexdigest()
    input_payload = {
        "type": "ReviseScopeV2",
        "acceptedScope": {
            "artifactId": str(compiled.artifact.artifact_id),
            "artifactHash": compiled.artifact.artifact_hash,
            "kind": "scope",
        },
        "correction": correction,
        "correctionSourceSpans": [
            {
                "start": 0,
                "end": len(correction),
                "text": correction,
                "sha256": correction_hash,
            }
        ],
    }
    raw = envelope().model_dump(mode="json", by_alias=True)
    raw.update(
        {
            "operationId": "00000000-0000-4000-8000-000000000021",
            "operationType": "ReviseScopeV2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )

    class Resolver:
        def artifact_payload(self, artifact_id):
            if artifact_id == compiled.artifact.artifact_id:
                return compiled.artifact.payload
            return None

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
                            DraftSpan(start=topic_start, end=topic_start + len("dog-food"))
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
        FakeDrafter(), b"a" * 32, artifact_resolver=Resolver(), scope_reviser=Reviser()
    )
    result = await executor.execute(AxWiseOperationEnvelope.model_validate(raw))
    revised = result.artifact.payload

    assert [topic["value"] for topic in revised["topicAnchors"]] == ["dog-food"]
    assert "cat-food" not in str(revised["topicAnchors"])
    assert revised["researchInputHash"] != compiled.artifact.payload["researchInputHash"]
    assert revised["authority"]["canonicalInputHash"] == canonical_hash(input_payload)
    assert result.artifact.source_artifact_ids == [compiled.artifact.artifact_id]


class MissingResearchRunner:
    def __init__(self):
        self.queries = []

    async def search(self, query):
        self.queries.append(query)
        return {"search_performed": True, "claims": [], "sources": []}


def research_envelope(scope_result, *, criticality, claim_type):
    scope = dict(scope_result.artifact.payload)
    scope["evidenceRequirements"][0]["criticality"] = criticality
    scope["evidenceRequirements"][0]["claimType"] = claim_type
    # Recompile when changing authority-bearing scope fields in the tests.
    return scope


async def _compiled_with_requirement(criticality, claim_type):
    class RequirementDrafter(FakeDrafter):
        async def draft(self, input_value):
            draft = await super().draft(input_value)
            draft.evidence_requirements[0].criticality = criticality
            draft.evidence_requirements[0].claim_type = claim_type
            return draft

    compile_executor = GeminiCognitiveExecutor(RequirementDrafter(), b"a" * 32)
    return await compile_executor.execute(envelope())


def _research_operation(compiled):
    scope_ref = {
        "artifactId": str(compiled.artifact.artifact_id),
        "artifactHash": compiled.artifact.artifact_hash,
        "kind": "scope",
    }
    input_payload = {
        "type": "ExecuteResearchV2",
        "acceptedScope": scope_ref,
        "scope": compiled.artifact.payload,
        "selectedEvidence": [],
    }
    base = envelope().model_dump(mode="json", by_alias=True)
    base.update(
        {
            "operationId": "00000000-0000-4000-8000-000000000031",
            "operationType": "ExecuteResearchV2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )
    return AxWiseOperationEnvelope.model_validate(base)


@pytest.mark.asyncio
async def test_optional_evidence_gap_delivers_useful_non_launch_ready_result():
    compiled = await _compiled_with_requirement("nonblocking", "market_statistic")
    runner = MissingResearchRunner()
    executor = GeminiCognitiveExecutor(FakeDrafter(), b"a" * 32, runner)
    result = await executor.execute(_research_operation(compiled))

    assert result.evidence_readiness == "ready_with_gaps"
    assert result.artifact.payload["launchReady"] is False
    assert result.artifact.payload["boundedRepairPasses"] == 1
    assert len(runner.queries) == 2
    assert all(REQUEST not in query for query in runner.queries)
    assert all("cat-food" in query and "Estonia" in query for query in runner.queries)


@pytest.mark.asyncio
async def test_unresolved_essential_legal_safety_evidence_blocks():
    compiled = await _compiled_with_requirement("blocking", "legal_safety")
    runner = MissingResearchRunner()
    executor = GeminiCognitiveExecutor(FakeDrafter(), b"a" * 32, runner)
    result = await executor.execute(_research_operation(compiled))

    assert result.evidence_readiness == "blocked"
    assert result.artifact.payload["readiness"] == "blocked"
    assert result.artifact.payload["launchReady"] is False


@pytest.mark.asyncio
async def test_synthesis_returns_final_markdown_without_false_launch_claims():
    scope_payload = {"schemaVersion": "axwise.scope.v2", "deliverables": ["PRD"]}
    research_payload = {
        "schemaVersion": "axwise.research.v2",
        "readiness": "ready_with_gaps",
        "claimLedger": [],
    }

    class Resolver:
        def artifact_payload(self, artifact_id):
            return {
                UUID("00000000-0000-4000-8000-000000000041"): scope_payload,
                UUID("00000000-0000-4000-8000-000000000042"): research_payload,
            }.get(artifact_id)

    class Writer:
        async def write(self, _input, _scope, _research):
            return SynthesisDraft(
                title="Estonia cat-food PRD",
                markdown="# PRD\n\n## Evidence gaps\n\nOptional market statistics remain unverified.",
            )

    refs = {
        "scope": {
            "artifactId": "00000000-0000-4000-8000-000000000041",
            "artifactHash": canonical_hash(scope_payload),
            "kind": "scope",
        },
        "research": {
            "artifactId": "00000000-0000-4000-8000-000000000042",
            "artifactHash": canonical_hash(research_payload),
            "kind": "research",
        },
    }
    input_payload = {
        "type": "SynthesizeArtifactV1",
        "acceptedScope": refs["scope"],
        "research": refs["research"],
        "acceptedPlan": {
            "artifactId": "00000000-0000-4000-8000-000000000043",
            "artifactHash": "a" * 64,
            "kind": "plan",
        },
        "taskArtifacts": [
            {
                "artifactId": "00000000-0000-4000-8000-000000000044",
                "artifactHash": "b" * 64,
                "kind": "task_result",
            }
        ],
        "evaluation": {
            "artifactId": "00000000-0000-4000-8000-000000000045",
            "artifactHash": "c" * 64,
            "kind": "evaluation",
        },
        "outputContract": {
            "format": "text/markdown",
            "requiredSections": ["PRD", "Evidence gaps"],
            "evidenceReadiness": "ready_with_gaps",
        },
    }
    raw = envelope().model_dump(mode="json", by_alias=True)
    raw.update(
        {
            "operationId": "00000000-0000-4000-8000-000000000046",
            "operationType": "SynthesizeArtifactV1",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )
    executor = GeminiCognitiveExecutor(FakeDrafter(), b"a" * 32, None, Resolver(), Writer())
    result = await executor.execute(AxWiseOperationEnvelope.model_validate(raw))

    assert result.artifact.kind == "final_markdown"
    assert result.artifact.content_type == "text/markdown"
    assert result.artifact.payload["evidenceReadiness"] == "ready_with_gaps"
    assert result.artifact.payload["launchReady"] is False
