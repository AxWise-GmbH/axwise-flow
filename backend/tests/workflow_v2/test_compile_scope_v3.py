from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompileScopeInputV3,
    artifact_content_hash,
    utf16_length,
)
from backend.services.workflow_v2.cognitive_executor import (
    SCOPE_V3_SYSTEM_PROMPT,
    DraftSpan,
    DraftTopicAnchor,
    GeminiCognitiveExecutor,
    ModelOutput,
    ScopeDraft,
)

pytestmark = pytest.mark.contract
FIXTURE = Path(__file__).with_name("fixtures") / "compile_scope_envelope_v3.json"
AUTHORITY_KEY = b"v" * 32


def _envelope() -> AxWiseOperationEnvelope:
    return AxWiseOperationEnvelope.model_validate(
        json.loads(FIXTURE.read_text(encoding="utf-8"))
    )


def _utf16_index(value: str, needle: str) -> int:
    return utf16_length(value[: value.index(needle)])


def _draft(
    request: str, *, topic: str, start: int, policies: list[str] | None = None
) -> ScopeDraft:
    instruction_end = utf16_length("Turn this into a launch plan 🚀.")
    accepted_policies = policies or []
    return ScopeDraft(
        objective="Create the referenced launch plan.",
        objective_source_spans=[DraftSpan(start=0, end=instruction_end)],
        topic_anchors=[
            DraftTopicAnchor(
                value=topic,
                source_spans=[
                    DraftSpan(start=start, end=start + utf16_length(topic))
                ],
            )
        ],
        geography=[],
        evidence_requirements=[],
        deliverables=["Launch plan"],
        personas=[],
        interview_requirements=[],
        prd_requirements=[],
        limits=[],
        policies=accepted_policies,
        deliverable_profile={
            "artifact_type": "operational_plan",
            "domain": "Launch planning",
            "problem": "Turn the selected research into an executable plan.",
            "desired_outcome": "A staged launch plan.",
            "audiences": ["Owner"],
            "non_goals": ["Treating prior assistant claims as verified evidence"],
            "required_sections": ["Launch plan"],
        },
        acceptance_criteria=[
            {
                "given": "The accepted Goal scope",
                "when": "The launch plan is evaluated",
                "then": "The launch plan is complete and traceable.",
                "supports": ["deliverable", *(["policy"] if accepted_policies else [])],
            }
        ],
        assumptions=[],
    )


class _V3Drafter:
    def __init__(self, topic: str = "staged pilot") -> None:
        self.topic = topic
        self.seen_input: CompileScopeInputV3 | None = None

    async def draft(self, input_value, objective_context):
        assert isinstance(input_value, CompileScopeInputV3)
        assert objective_context == []
        self.seen_input = input_value
        start = _utf16_index(input_value.request, self.topic)
        return ModelOutput(
            _draft(input_value.request, topic=self.topic, start=start),
            input_tokens=7,
            output_tokens=11,
        )


@pytest.mark.asyncio
async def test_compile_scope_v3_dispatches_and_can_cite_assistant_reference() -> None:
    drafter = _V3Drafter()
    envelope = _envelope()

    result = await GeminiCognitiveExecutor(drafter, AUTHORITY_KEY).execute(envelope)
    scope = result.artifact.payload

    assert drafter.seen_input is envelope.input
    assert scope["topicAnchors"][0]["value"] == "staged pilot"
    assert scope["topicAnchors"][0]["sourceSpans"][0] == {
        "start": 123,
        "end": 135,
        "offsetUnit": "utf16_code_units",
        "text": "staged pilot",
        "sha256": "6061dff3e614a6bab0d0751d0f7811dfdbaa0778fcbca6af6c6b2d082e729687",
    }
    assert scope["authority"]["canonicalInputHash"] == (
        envelope.canonical_input_hash
    )
    assert result.artifact.artifact_hash == artifact_content_hash(
        content_type="application/json", payload=scope, markdown=None
    )
    assert result.metrics.input_tokens == 7
    assert result.metrics.output_tokens == 11


@pytest.mark.asyncio
async def test_compile_scope_v3_rejects_a_source_span_over_an_authority_header(
) -> None:
    class _HeaderDrafter(_V3Drafter):
        async def draft(self, input_value, objective_context):
            assert isinstance(input_value, CompileScopeInputV3)
            header = "ASSISTANT_REFERENCE"
            return ModelOutput(
                _draft(
                    input_value.request,
                    topic=header,
                    start=_utf16_index(input_value.request, header),
                )
            )

    with pytest.raises(ValueError, match="inside canonical message content"):
        await GeminiCognitiveExecutor(_HeaderDrafter(), AUTHORITY_KEY).execute(
            _envelope()
        )


@pytest.mark.asyncio
async def test_compile_scope_v3_does_not_mark_assistant_only_policy_as_owner() -> None:
    class _AssistantPolicyDrafter(_V3Drafter):
        async def draft(self, input_value, objective_context):
            topic = "staged pilot"
            return ModelOutput(
                _draft(
                    input_value.request,
                    topic=topic,
                    start=_utf16_index(input_value.request, topic),
                    policies=["Evidence suggests a staged pilot."],
                )
            )

    result = await GeminiCognitiveExecutor(
        _AssistantPolicyDrafter(), AUTHORITY_KEY
    ).execute(_envelope())
    policy = next(
        requirement
        for requirement in result.artifact.payload["requirements"]
        if requirement["category"] == "policy"
    )

    assert policy["description"] == "Evidence suggests a staged pilot."
    assert policy["authority"] == "axwise_derived"


def test_compile_scope_v3_prompt_enforces_authority_and_clarification_boundary(
) -> None:
    normalized = " ".join(SCOPE_V3_SYSTEM_PROMPT.split())

    assert "OWNER_CURRENT" in SCOPE_V3_SYSTEM_PROMPT
    assert "OWNER_PRIOR" in SCOPE_V3_SYSTEM_PROMPT
    assert "ASSISTANT_REFERENCE" in SCOPE_V3_SYSTEM_PROMPT
    assert "may never override an explicit owner constraint" in normalized
    assert "not accepted evidence" in normalized
    assert "grounded again" in normalized
    assert "publisher/source-host restrictions" in normalized
    assert "return one material clarification rather than inventing" in normalized
