"""No-provider regressions for review of the exact publishable repaired draft."""

from __future__ import annotations

import copy
import asyncio
import hashlib
import json
from types import SimpleNamespace

import pytest

import backend.services.workflow_v2.cognitive_executor as executor_module
import backend.tests.workflow_v2.test_cognitive_executor as fixture_module

from backend.services.workflow_v2.cognitive_executor import (
    EvaluationDraft,
    GeminiCognitiveExecutor,
    ModelOutput,
    PydanticAISynthesisWriter,
    SynthesisDraft,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.tests.workflow_v2.test_cognitive_executor import (
    AUTHORITY_KEY,
    FakeDrafter,
    QualityWriter,
    Resolver,
    _final_writer_fixture,
    artifact_ref,
    cognitive_input,
    compiled_scope,
    envelope_for,
    quality_markdown,
)

pytestmark = pytest.mark.contract


def semantic_receipt(caplog):
    receipts = [
        json.loads(record.message.removeprefix("final_semantic_review "))
        for record in caplog.records
        if record.message.startswith("final_semantic_review ")
    ]
    assert len(receipts) == 1
    return receipts[0]


@pytest.mark.asyncio
async def test_real_final_reviewer_prompt_binds_exact_body_hash_and_model_usage(
    monkeypatch,
):
    compiled, research, input_value, contents = await _final_writer_fixture()
    writer = object.__new__(PydanticAISynthesisWriter)
    writer.evaluation_agent = object()
    final_draft = SynthesisDraft(
        title="Repaired ERP plan",
        markdown="# Repaired ERP plan\n\nCancellation prevents new writes; replay retains committed stock.",
    )
    calls = []

    async def review(agent, prompt, context, *, phase):
        calls.append((agent, prompt, context, phase))
        return SimpleNamespace(output=EvaluationDraft(note="Exact final checked."))

    monkeypatch.setattr(
        PydanticAISynthesisWriter, "_run_validated_agent", staticmethod(review)
    )
    monkeypatch.setattr(executor_module, "_usage_from_result", lambda _result: (13, 5))
    monkeypatch.setattr(
        executor_module,
        "exact_uniform_model_version_from_result",
        lambda _result: "fixture-v1",
    )
    result = await writer.evaluate_final(
        input_value,
        compiled.artifact.payload,
        research.artifact.payload,
        contents,
        final_draft,
    )
    assert len(calls) == 1
    prompt = calls[0][1]
    payload = json.loads(prompt.split("\n", 1)[1])
    assert payload["FINAL_PUBLICATION"] == final_draft.model_dump(mode="json")
    assert (
        payload["FINAL_PUBLICATION_SHA256"]
        == hashlib.sha256(final_draft.markdown.encode()).hexdigest()
    )
    assert payload["OUTPUT_CONTRACT"] == input_value.output_contract.model_dump(
        mode="json", by_alias=True
    )
    assert payload["ACCEPTED_SCOPE"] == compiled.artifact.payload
    assert "no earlier clean review" in prompt
    assert "No further repair or execution" in prompt
    assert (result.input_tokens, result.output_tokens, result.model_version) == (
        13,
        5,
        "fixture-v1",
    )


async def final_case(writer):
    compiled, research, input_value, contents = await _final_writer_fixture()
    prior = next(item for item in contents if item.artifact == input_value.evaluation)
    evaluation = copy.deepcopy(prior.payload)
    # The earlier core critic has no semantic flags. An explicitly unmet assembly
    # requirement still requests final repair, as required by EvaluationResultV1.
    for key in (
        "unsupportedPrecision",
        "contradictions",
        "staleTopicReferences",
        "readinessViolations",
        "substantiveContentDefects",
        "practicalityDefects",
    ):
        evaluation[key] = []
    evaluation.update(
        outputContractSatisfied=False,
        promotedArtifact=None,
        repairRequired=True,
        unmetRequirementIds=[input_value.output_contract.requirement_ids[0]],
        repairInstructions=[
            "Assemble the exact final publication without adding claims."
        ],
    )
    evaluation_ref, evaluation_content = artifact_ref(
        "00000000-0000-4000-8000-000000009951",
        "evaluation",
        "application/json",
        evaluation,
    )
    plan_ref = input_value.accepted_plan.model_dump(mode="json", by_alias=True)
    task_refs = [
        item.model_dump(mode="json", by_alias=True)
        for item in input_value.task_artifacts
    ]
    plan_and_task_contents = [
        item.model_dump(mode="json", by_alias=True)
        for item in contents
        if item.artifact == input_value.accepted_plan
        or item.artifact in input_value.task_artifacts
    ]
    payload = cognitive_input(
        purpose="final_synthesis",
        compiled=compiled,
        research=research,
        output_contract=input_value.output_contract.model_dump(
            mode="json", by_alias=True
        ),
        extra_refs=[plan_ref, *task_refs, evaluation_ref],
        extra_contents=[*plan_and_task_contents, evaluation_content],
        repair_pass=1,
        acceptedPlan=plan_ref,
        taskArtifacts=task_refs,
        evaluation=evaluation_ref,
    )
    executor = GeminiCognitiveExecutor(
        FakeDrafter(),
        AUTHORITY_KEY,
        artifact_resolver=Resolver(compiled.artifact, research.artifact),
        synthesis_writer=writer,
    )
    return executor, envelope_for(
        payload,
        operation_id="00000000-0000-4000-8000-000000009952",
        operation_type="SynthesizeArtifactV1",
    )


async def nonplanning_final_case(writer, monkeypatch):
    async def content_scope(**kwargs):
        return await compiled_scope(
            request="Write a cat-food decision note.",
            artifact_type="content_artifact",
            deliverables=["Decision note"],
            **kwargs,
        )

    # Override only fixture construction: scope compilation, artifact hashes,
    # research, task execution and the final executor still use their real paths.
    monkeypatch.setattr(fixture_module, "compiled_scope", content_scope)
    executor, operation = await final_case(writer)
    assert operation.input.output_contract.artifact_type == "content_artifact"
    return executor, operation


class FinalReviewWriter(QualityWriter):
    def __init__(self, *, text="", review=None, metrics=False):
        self.text = text
        self.review = (
            review if review is not None else EvaluationDraft(note="Clean final.")
        )
        self.metrics = metrics
        self.write_calls = 0
        self.final_calls = 0
        self.reviewed = None
        self.reviewed_input = None

    async def write(self, _input, _scope, research, _contents):
        self.write_calls += 1
        draft = SynthesisDraft(
            title="Reviewed final delivery specification",
            markdown=quality_markdown(research) + self.text,
        )
        return ModelOutput(draft, 11, 7, "fixture-v1") if self.metrics else draft

    async def evaluate_final(
        self, input_value, _scope, _research, _contents, final_draft
    ):
        self.final_calls += 1
        self.reviewed = final_draft
        self.reviewed_input = input_value
        assert isinstance(final_draft, SynthesisDraft)
        return (
            ModelOutput(self.review, 13, 5, "fixture-v1")
            if self.metrics
            else self.review
        )


@pytest.mark.asyncio
async def test_clean_planning_final_adds_unverified_notice_after_exact_body_review(caplog):
    marker = "\n\n## Rewritten assembly\n\nRetain the immutable ERP replay ledger."
    writer = FinalReviewWriter(text=marker)
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    assert writer.write_calls == writer.final_calls == 1
    assert writer.reviewed_input.purpose == "final_synthesis"
    assert marker.strip() in writer.reviewed.markdown
    assert result.artifact.kind == "final_markdown"
    assert "## Review notes — advisory" not in writer.reviewed.markdown
    reviewed_body, separator, source_body = writer.reviewed.markdown.partition(
        "\n\n## Sources\n"
    )
    published_body, published_separator, published_sources = (
        result.artifact.markdown.partition("\n\n## Sources\n")
    )
    assert published_body.startswith(reviewed_body.rstrip() + "\n\n")
    assert (published_separator, published_sources) == (separator, source_body)
    assert published_body.count("## Review notes — advisory") == 1
    assert "Draft for human review." in published_body
    assert (
        "No concerns were identified by this automated review; correctness "
        "remains unverified."
    ) in published_body
    assert result.artifact.payload["launchReady"] is False
    receipt = semantic_receipt(caplog)
    assert receipt["advisory"] is True
    assert receipt["accepted"] is True
    assert not any(receipt["issue_counts"].values())
    assert receipt["reviewed_markdown_sha256"] == hashlib.sha256(
        writer.reviewed.markdown.encode()
    ).hexdigest()
    assert receipt["markdown_sha256"] == hashlib.sha256(
        result.artifact.markdown.encode()
    ).hexdigest()
    assert receipt["reviewed_markdown_sha256"] != receipt["markdown_sha256"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "contradiction",
    [
        "At 10 records per second, a batch of 600 records completes in 10 seconds.",
        "Cancellation prohibits new writes, but the cancelled job starts another stock write.",
        "Replay preserves committed stock, but replay first clears all committed inventory.",
    ],
)
async def test_new_planning_contradiction_is_published_as_advisory_after_clean_core_review(
    contradiction,
):
    writer = FinalReviewWriter(
        text="\n\n## ERP decision\n\n" + contradiction,
        review=EvaluationDraft(
            contradictions=[contradiction], note="Rewritten body contradicts itself."
        ),
    )
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    assert contradiction in writer.reviewed.markdown
    assert contradiction in result.artifact.markdown
    notes = result.artifact.markdown.split("## Review notes — advisory", 1)[1]
    assert "- **Consistency concern:** " + contradiction.replace(".", r"\.") in notes
    assert "not verified facts or proof that all other issues were found" in notes
    assert result.artifact.payload["launchReady"] is False
    assert writer.write_calls == writer.final_calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field,label",
    [
        ("unsupported_precision", "Evidence concern"),
        ("contradictions", "Consistency concern"),
        ("stale_topic_references", "Relevance concern"),
        ("readiness_violations", "Readiness concern"),
        ("substantive_content_defects", "Content concern"),
        ("practicality_defects", "Practicality concern"),
        ("repair_instructions", "Suggested revision"),
    ],
)
async def test_each_planning_review_flag_remains_visible_without_rewrite(field, label):
    writer = FinalReviewWriter(
        review=EvaluationDraft(
            **{field: ["Bounded review defect."], "note": "Needs human review."}
        )
    )
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    notes = result.artifact.markdown.split("## Review notes — advisory", 1)[1]
    assert f"- **{label}:** Bounded review defect\\." in notes
    assert "not implementation verification or launch approval" in notes
    assert result.artifact.payload["launchReady"] is False
    assert writer.write_calls == writer.final_calls == 1


@pytest.mark.asyncio
async def test_advisory_review_is_literal_content_not_active_markup_or_evidence(caplog):
    review_text = (
        '<script>alert("review")</script>\n## Launch approved\n'
        "[evidence:invented] [Open](https://example.invalid) **verified**"
    )
    writer = FinalReviewWriter(
        review=EvaluationDraft(contradictions=[review_text], note="Review only.")
    )
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    notes = result.artifact.markdown.split("## Review notes — advisory", 1)[1]
    assert (
        r'- **Consistency concern:** &lt;script&gt;alert\("review"\)&lt;/script&gt; '
        r'\#\# Launch approved ［evidence:invented］ '
        r'［Open］\(https://example\.invalid\) \*\*verified\*\*'
    ) in notes
    assert "<script>" not in notes
    assert "\n## Launch approved" not in notes
    assert "[evidence:invented]" not in notes
    assert "[Open](https://example.invalid)" not in notes
    assert result.artifact.payload["launchReady"] is False
    assert writer.write_calls == writer.final_calls == 1
    assert review_text not in caplog.text
    receipt = semantic_receipt(caplog)
    assert receipt["issue_counts"]["contradictions"] == 1
    assert receipt["reviewed_markdown_sha256"] == hashlib.sha256(
        writer.reviewed.markdown.encode()
    ).hexdigest()
    assert receipt["markdown_sha256"] == hashlib.sha256(
        result.artifact.markdown.encode()
    ).hexdigest()
    assert receipt["reviewed_markdown_sha256"] != receipt["markdown_sha256"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", ["missing", "exception", "none", "dict", "forged_model"]
)
async def test_missing_or_invalid_final_reviewer_never_publishes(failure):
    class BrokenReviewer(FinalReviewWriter):
        async def evaluate_final(self, *args):
            self.final_calls += 1
            if failure == "exception":
                raise RuntimeError("PRIVATE_REVIEWER_CONTENT")
            if failure == "dict":
                return {"note": "Malformed review", "contradictions": "not-an-array"}
            if failure == "forged_model":
                return EvaluationDraft.model_construct(
                    note="Invalid internal model", contradictions=None
                )
            return None

    writer = BrokenReviewer()
    if failure == "missing":
        writer.evaluate_final = None
    executor, operation = await final_case(writer)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(operation)
    assert caught.value.error_class.startswith("AXWISE_FINAL_SEMANTIC_")
    assert caught.value.retryable is False
    assert "PRIVATE_REVIEWER_CONTENT" not in str(caught.value)
    assert writer.write_calls == 1
    assert writer.final_calls == (0 if failure == "missing" else 1)


@pytest.mark.asyncio
async def test_final_publication_metrics_combine_writer_and_reviewer_usage():
    writer = FinalReviewWriter(metrics=True)
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    assert writer.write_calls == writer.final_calls == 1
    assert result.metrics.input_tokens == 24
    assert result.metrics.output_tokens == 12
    assert result.metrics.total_tokens == 36


@pytest.mark.asyncio
async def test_final_publication_does_not_misattribute_different_reviewer_model_version():
    class DifferentVersionReviewer(FinalReviewWriter):
        async def evaluate_final(self, *args):
            result = await super().evaluate_final(*args)
            return ModelOutput(
                result.value, result.input_tokens, result.output_tokens, "reviewer-v2"
            )

    writer = DifferentVersionReviewer(metrics=True)
    executor, operation = await final_case(writer)
    result = await executor.execute(operation)
    assert result.metrics.input_tokens == 24
    assert result.metrics.output_tokens == 12
    assert result.metrics.model_version is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure", ["writer_timeout", "writer_retryable_failure", "reviewer_timeout"]
)
async def test_final_repair_failure_never_authorizes_another_paid_write(failure):
    class FailingWriter(FinalReviewWriter):
        async def write(self, *args):
            if failure == "reviewer_timeout":
                return await super().write(*args)
            self.write_calls += 1
            if failure == "writer_timeout":
                raise asyncio.TimeoutError
            raise CognitiveExecutionFailure(
                "AXWISE_FINAL_PROVIDER_FAILED", retryable=True
            )

        async def evaluate_final(self, *args):
            self.final_calls += 1
            raise asyncio.TimeoutError

    writer = FailingWriter()
    executor, operation = await final_case(writer)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(operation)
    assert caught.value.retryable is False
    assert writer.write_calls == 1
    assert writer.final_calls == (1 if failure == "reviewer_timeout" else 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "field",
    [
        "unsupported_precision",
        "contradictions",
        "stale_topic_references",
        "readiness_violations",
        "substantive_content_defects",
        "practicality_defects",
        "repair_instructions",
    ],
)
async def test_nonplanning_final_still_rejects_flags_and_retains_private_usage(
    caplog, monkeypatch, field
):
    secret = "PRIVATE_REVIEW_SENTINEL_ERP_98765"
    writer = FinalReviewWriter(
        text="\n\n## Decision note\n\nPreserve the bounded evidence-based decision.",
        metrics=True,
        review=EvaluationDraft(
            **{field: [secret], "note": "Final requires a correction."}
        ),
    )
    executor, operation = await nonplanning_final_case(writer, monkeypatch)
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(operation)
    error = caught.value
    assert error.error_class == "AXWISE_FINAL_SEMANTIC_REJECTED"
    assert error.retryable is False
    assert writer.write_calls == writer.final_calls == 1
    assert error.diagnostics == {
        "route": "final_synthesis",
        "status": "semantic_rejected",
    }
    usage = next(
        record.message
        for record in caplog.records
        if record.message.startswith("cognitive_failure_usage ")
    )
    usage = json.loads(usage.removeprefix("cognitive_failure_usage "))
    assert usage["operation_id"] == str(operation.operation_id)
    assert usage["input_tokens"] == 24
    assert usage["output_tokens"] == 12
    assert usage["total_tokens"] == 36
    assert usage["known_usage_only"] is True
    assert usage["billing_reconciled"] is False
    assert secret not in json.dumps(error.diagnostics)
    assert secret not in caplog.text
    receipt = semantic_receipt(caplog)
    assert receipt["accepted"] is False
    assert receipt["advisory"] is False
    assert receipt["issue_counts"][field] == 1
    assert (
        receipt["markdown_sha256"]
        == hashlib.sha256(writer.reviewed.markdown.encode()).hexdigest()
    )
    assert receipt["reviewed_markdown_sha256"] == receipt["markdown_sha256"]


@pytest.mark.asyncio
async def test_evaluation_rejects_overflow_instead_of_dropping_precision_findings(
    monkeypatch,
):
    compiled, research, input_value, contents = await _final_writer_fixture()

    class ManyFindingsWriter(QualityWriter):
        async def evaluate_output(self, *args):
            return EvaluationDraft(
                unsupported_precision=[
                    f"Model defect {index:02d}" for index in range(40)
                ],
                note="All forty model findings must survive.",
            )

    plan_ref = input_value.accepted_plan.model_dump(mode="json", by_alias=True)
    task_refs = [
        item.model_dump(mode="json", by_alias=True)
        for item in input_value.task_artifacts
    ]
    selected = [
        item.model_dump(mode="json", by_alias=True)
        for item in contents
        if item.artifact == input_value.accepted_plan
        or item.artifact in input_value.task_artifacts
    ]
    payload = cognitive_input(
        purpose="evaluate_output",
        compiled=compiled,
        research=research,
        output_contract=input_value.output_contract.model_dump(
            mode="json", by_alias=True
        ),
        extra_refs=[plan_ref, *task_refs],
        extra_contents=selected,
        repair_pass=0,
        acceptedPlan=plan_ref,
        taskArtifacts=task_refs,
    )
    monkeypatch.setattr(
        executor_module,
        "_deterministic_evidence_integrity_defects",
        lambda *args, **kwargs: [
            "Additional deterministic defect beyond the forty model findings."
        ],
    )
    executor = GeminiCognitiveExecutor(
        FakeDrafter(),
        AUTHORITY_KEY,
        artifact_resolver=Resolver(compiled.artifact, research.artifact),
        synthesis_writer=ManyFindingsWriter(),
    )
    with pytest.raises(CognitiveExecutionFailure) as caught:
        await executor.execute(
            envelope_for(payload, operation_type="SynthesizeArtifactV1")
        )
    assert caught.value.error_class == "AXWISE_EVALUATION_FINDINGS_OVERFLOW"
    assert caught.value.retryable is False
