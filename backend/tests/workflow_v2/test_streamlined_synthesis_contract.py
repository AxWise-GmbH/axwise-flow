"""No-provider regressions for one immutable synthesis decision/context boundary."""

from __future__ import annotations

import copy
import json
import socket
from pathlib import Path

import pytest

import backend.services.workflow_v2.cognitive_executor as executor_module
from backend.services.workflow_v2.cognitive_executor import (
    PydanticAISynthesisWriter,
    SynthesisDraft,
)
from backend.domain.workflow_v2.contracts import SynthesizeArtifactInputV1
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.tests.workflow_v2.test_cognitive_executor import QualityWriter
from backend.tests.workflow_v2.test_final_semantic_gate import final_case

pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("Streamlined synthesis regressions must not contact a provider.")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)


@pytest.fixture
def final_inputs():
    fixture = Path(__file__).parent / "fixtures" / "synthesize_artifact_v1_golden.json"
    cases = json.loads(fixture.read_text(encoding="utf-8"))["cases"]
    raw = next(item["input"] for item in cases if item["name"] == "final_synthesis")
    value = SynthesizeArtifactInputV1.model_validate(raw)
    contents = list(value.artifact_contents)
    scope = next(
        item.payload for item in contents if item.artifact == value.accepted_scope
    )
    research = next(
        item.payload for item in contents if item.artifact == value.research
    )
    return value, contents, scope, research


def core_content(contents):
    return next(
        item
        for item in contents
        if item.payload.get("task", {}).get("taskKind") == "core_draft"
        or item.payload.get("candidateAttestation", {}).get("task", {}).get("taskKind")
        == "core_draft"
    )


def writer_context(final_inputs):
    value, contents, scope, research = final_inputs
    writer = object.__new__(PydanticAISynthesisWriter)
    return writer._context(value, scope, research, contents)


@pytest.mark.parametrize("candidate_kind", ["task_result", "final_markdown"])
def test_shared_context_does_not_promote_draft_shape_to_accepted_requirements(
    final_inputs, candidate_kind
):
    value, contents, scope, research = final_inputs
    core = core_content(contents)
    if candidate_kind == "final_markdown":
        replacement = core.model_copy(
            update={
                "artifact": core.artifact.model_copy(update={"kind": "final_markdown"}),
                "payload": {
                    "title": core.payload["title"],
                    "markdown": core.markdown,
                    "candidateAttestation": {"task": core.payload["task"]},
                },
            }
        )
        contents = [replacement if item is core else item for item in contents]
    # The builder must be callable by both executor and writer, not an instance-only
    # implementation that the executor has to reproduce by hand.
    context = PydanticAISynthesisWriter._context(value, scope, research, contents)
    assert context.final_repair_topology is None
    assert context.required_sections == value.output_contract.required_sections
    assert context.accepted_requirements
    assert (
        context.accepted_acceptance_criteria
        == value.output_contract.acceptance_criteria
    )
    # Removing accidental draft headings is allowed, but actual accepted sections
    # remain required. This fails before prose/evidence quality checks.
    with pytest.raises(ValueError, match="required Markdown sections are missing"):
        executor_module._validate_synthesis(
            context,
            SynthesisDraft(title="Incomplete", markdown="# Unrequested replacement"),
        )


def test_dependency_markdown_is_serialized_once_without_mutating_receipts(final_inputs):
    value, contents, scope, research = final_inputs
    before = [item.model_dump(mode="json", by_alias=True) for item in contents]
    prompt = PydanticAISynthesisWriter._prompt(
        value,
        scope,
        research,
        contents,
        PydanticAISynthesisWriter._allowed_claim_ids(research),
    )
    rows = json.loads(prompt)["SELECTED_IMMUTABLE_ARTIFACTS"]
    for source in contents:
        if source.artifact.kind != "task_result":
            continue
        row = next(
            row
            for row in rows
            if row["artifact"]["artifactId"] == str(source.artifact.artifact_id)
        )
        assert row["payload"]["markdown"] == source.markdown
        assert "markdown" not in row
        assert prompt.count(json.dumps(source.markdown, ensure_ascii=False)) == 1
        assert row["artifact"] == source.artifact.model_dump(mode="json", by_alias=True)
        assert row["payload"]["conclusions"] == source.payload["conclusions"]
    assert [item.model_dump(mode="json", by_alias=True) for item in contents] == before


def test_final_prompt_retains_original_accepted_scope_and_existing_decisions(
    final_inputs,
):
    value, contents, scope, research = final_inputs
    payload = json.loads(
        PydanticAISynthesisWriter._final_repair_prompt(
            value, contents, writer_context(final_inputs)
        )
    )
    core = core_content(contents)
    assert payload["ACCEPTED_SCOPE"] == scope
    assert payload[
        "RESEARCH_RESULT"
    ] == PydanticAISynthesisWriter._research_prompt_view(research, scope)
    assert payload["BASE_MARKDOWN"] == core.markdown
    assert payload["CORE_ARTIFACT"] == core.artifact.model_dump(
        mode="json", by_alias=True
    )
    decisions = json.dumps(payload["CORE_DECISIONS"])
    for conclusion in core.payload["conclusions"]:
        assert conclusion in decisions
    specialist_decisions = json.dumps(payload["SPECIALIST_DECISIONS"])
    for item in contents:
        if item.payload.get("task", {}).get("taskKind") != "specialist_analysis":
            continue
        for conclusion in item.payload["conclusions"]:
            assert conclusion in specialist_decisions
        # Final repair needs these bounded decisions, not a second full copy of
        # every specialist's prose alongside the evaluated core.
        assert item.markdown not in payload.values()


def test_final_repair_receives_evaluated_core_not_a_server_rewritten_base(
    final_inputs, monkeypatch
):
    value, contents, _scope, _research = final_inputs
    context = writer_context(final_inputs)
    original = core_content(contents).markdown
    before = [item.model_dump(mode="json", by_alias=True) for item in contents]

    def server_projection(*_args, **_kwargs):
        return SynthesisDraft(
            title="Rewritten by server", markdown="SERVER_REWRITTEN_BASE"
        )

    monkeypatch.setattr(
        executor_module, "_project_final_repair_base", server_projection
    )
    payload = json.loads(
        PydanticAISynthesisWriter._final_repair_prompt(value, contents, context)
    )
    assert payload["BASE_MARKDOWN"] == original
    assert "SERVER_REWRITTEN_BASE" not in json.dumps(payload)
    assert [item.model_dump(mode="json", by_alias=True) for item in contents] == before


def test_every_concrete_critic_field_and_instruction_survives_the_final_handoff(
    final_inputs,
):
    value, contents, _scope, _research = final_inputs
    evaluation = next(item for item in contents if item.artifact == value.evaluation)
    fields = (
        "unsupportedPrecision",
        "contradictions",
        "staleTopicReferences",
        "readinessViolations",
        "substantiveContentDefects",
        "practicalityDefects",
    )
    findings = {field: [f"Exact reviewer finding for {field}."] for field in fields}
    instructions = [
        "Retain the source ordering decision; repair the competing arrival rule."
    ]
    changed_payload = copy.deepcopy(evaluation.payload)
    changed_payload.update(findings, repairInstructions=instructions)
    replacement = evaluation.model_copy(update={"payload": changed_payload})
    contents = [replacement if item is evaluation else item for item in contents]
    payload = json.loads(
        PydanticAISynthesisWriter._final_repair_prompt(
            value, contents, writer_context(final_inputs)
        )
    )
    for field, expected in findings.items():
        assert set(expected).issubset(payload["REPAIR_TARGETS"][field])
    assert set(instructions).issubset(payload["REPAIR_INSTRUCTIONS"])
    assert replacement.payload == changed_payload


@pytest.mark.asyncio
async def test_executor_and_writer_share_context_without_draft_topology(monkeypatch):
    class ContextWriter(QualityWriter):
        observed_context = None

        async def write(self, value, scope, research, contents):
            self.observed_context = PydanticAISynthesisWriter._context(
                value, scope, research, contents
            )
            return await super().write(value, scope, research, contents)

    writer = ContextWriter()
    executor, operation = await final_case(writer)
    observed = []
    original_normalize = executor_module._normalize_reader_draft

    def record_context(context, draft):
        if context.purpose == "final_synthesis":
            observed.append(context.model_dump(mode="json"))
        return original_normalize(context, draft)

    monkeypatch.setattr(executor_module, "_normalize_reader_draft", record_context)
    result = await executor.execute(operation)
    assert result.artifact.kind == "final_markdown"
    assert writer.observed_context.final_repair_topology is None
    assert observed
    assert all(
        context == writer.observed_context.model_dump(mode="json")
        for context in observed
    )


@pytest.mark.asyncio
async def test_final_writer_validation_exhaustion_never_returns_core_as_success(
    final_inputs, monkeypatch
):
    value, contents, scope, research = final_inputs
    writer = object.__new__(PydanticAISynthesisWriter)
    writer.final_agent = object()
    calls = []
    failure = CognitiveExecutionFailure(
        "AXWISE_FINAL_OUTPUT_VALIDATION_EXHAUSTED_STRUCTURED_OUTPUT_INVALID",
        retryable=False,
    )

    async def exhausted(_agent, _prompt, _context, *, phase):
        calls.append(phase)
        raise failure

    monkeypatch.setattr(
        PydanticAISynthesisWriter, "_run_validated_agent", staticmethod(exhausted)
    )
    with pytest.raises(CognitiveExecutionFailure) as raised:
        await writer.write(value, scope, research, contents)
    assert raised.value is failure
    assert calls == ["FINAL"]
