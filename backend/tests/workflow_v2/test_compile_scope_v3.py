from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompileScopeInputV3,
    artifact_content_hash,
    canonical_hash,
    utf16_length,
)
from backend.services.workflow_v2.cognitive_executor import (
    SCOPE_V3_SYSTEM_PROMPT,
    DraftSpan,
    DraftTopicAnchor,
    GeminiCognitiveExecutor,
    ModelOutput,
    ScopeDraft,
    _canonical_artifact_type,
)

pytestmark = pytest.mark.contract
FIXTURE = Path(__file__).with_name("fixtures") / "compile_scope_envelope_v3.json"
AUTHORITY_KEY = b"v" * 32


def _envelope() -> AxWiseOperationEnvelope:
    return AxWiseOperationEnvelope.model_validate(
        json.loads(FIXTURE.read_text(encoding="utf-8"))
    )


def _content_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _envelope_with_context(
    *, current_owner: str, prior_owner: str, assistant_reference: str
) -> AxWiseOperationEnvelope:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    context = payload["input"]["assistantContext"]
    instruction = context["instruction"]
    prior = context["turns"][0]["user"]
    assistant = context["turns"][0]["assistant"]

    instruction_hash = _content_hash(current_owner)
    instruction["content"] = current_owner
    instruction["sourceSpan"] = {
        "start": 0,
        "end": utf16_length(current_owner),
        "offsetUnit": "utf16_code_units",
        "text": current_owner,
        "sha256": instruction_hash,
    }
    context["currentMessageHash"] = instruction_hash

    cursor = utf16_length(current_owner) + utf16_length("\n\nOWNER_PRIOR\n")
    prior_hash = _content_hash(prior_owner)
    prior["content"] = prior_owner
    prior["contentSha256"] = prior_hash
    prior["sourceMessageHash"] = prior_hash
    prior["sourceSpan"] = {
        "start": cursor,
        "end": cursor + utf16_length(prior_owner),
        "offsetUnit": "utf16_code_units",
        "text": prior_owner,
        "sha256": prior_hash,
    }

    cursor += utf16_length(prior_owner) + utf16_length(
        "\n\nASSISTANT_REFERENCE\n"
    )
    assistant_hash = _content_hash(assistant_reference)
    assistant["content"] = assistant_reference
    assistant["contentSha256"] = assistant_hash
    assistant["sourceMessageHash"] = assistant_hash
    assistant["sourceSpan"] = {
        "start": cursor,
        "end": cursor + utf16_length(assistant_reference),
        "offsetUnit": "utf16_code_units",
        "text": assistant_reference,
        "sha256": assistant_hash,
    }

    payload["input"]["request"] = (
        f"{current_owner}\n\nOWNER_PRIOR\n{prior_owner}"
        f"\n\nASSISTANT_REFERENCE\n{assistant_reference}"
    )
    context_without_hash = dict(context)
    context_without_hash.pop("envelopeHash")
    context["envelopeHash"] = canonical_hash(context_without_hash)
    payload["canonicalInputHash"] = canonical_hash(payload["input"])
    return AxWiseOperationEnvelope.model_validate(payload)


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


class _ArtifactDrafter(_V3Drafter):
    def __init__(self, *, artifact_type: str, deliverable: str) -> None:
        super().__init__()
        self.artifact_type = artifact_type
        self.deliverable = deliverable

    async def draft(self, input_value, objective_context):
        output = await super().draft(input_value, objective_context)
        draft = output.value.model_copy(
            update={
                "deliverables": [self.deliverable],
                "deliverable_profile": output.value.deliverable_profile.model_copy(
                    update={
                        "artifact_type": self.artifact_type,
                        "required_sections": [self.deliverable],
                    }
                ),
            }
        )
        return ModelOutput(
            draft,
            input_tokens=output.input_tokens,
            output_tokens=output.output_tokens,
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
async def test_compile_scope_v3_rejects_assistant_only_policy() -> None:
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

    with pytest.raises(ValueError, match="policy must be literal owner text"):
        await GeminiCognitiveExecutor(
            _AssistantPolicyDrafter(), AUTHORITY_KEY
        ).execute(_envelope())


@pytest.mark.asyncio
async def test_compile_scope_v3_accepts_an_explicit_safe_default_policy() -> None:
    policy_text = "Evidence suggests a staged pilot."

    class _SafeDefaultPolicyDrafter(_V3Drafter):
        async def draft(self, input_value, objective_context):
            topic = "staged pilot"
            return ModelOutput(
                _draft(
                    input_value.request,
                    topic=topic,
                    start=_utf16_index(input_value.request, topic),
                    policies=[policy_text],
                )
            )

    envelope_payload = _envelope().model_dump(mode="json", by_alias=True)
    envelope_payload["input"]["safeDefaults"]["policies"] = [policy_text]
    envelope_payload["canonicalInputHash"] = canonical_hash(envelope_payload["input"])
    envelope = AxWiseOperationEnvelope.model_validate(envelope_payload)
    result = await GeminiCognitiveExecutor(
        _SafeDefaultPolicyDrafter(), AUTHORITY_KEY
    ).execute(envelope)
    policy = next(
        requirement
        for requirement in result.artifact.payload["requirements"]
        if requirement["category"] == "policy"
    )

    assert policy["description"] == policy_text
    assert policy["authority"] == "safe_default"


@pytest.mark.asyncio
async def test_compile_scope_v3_current_owner_checklist_wins_over_prior_plan(
) -> None:
    envelope = _envelope_with_context(
        current_owner="Make the staged pilot deliverable a concise checklist.",
        prior_owner="Create an operational plan for the staged pilot.",
        assistant_reference="The requested deliverable is an operational plan.",
    )
    drafter = _ArtifactDrafter(
        artifact_type="operational_plan",
        deliverable="Concise checklist for the staged pilot",
    )

    result = await GeminiCognitiveExecutor(drafter, AUTHORITY_KEY).execute(envelope)

    assert result.artifact.payload["deliverableProfile"]["artifactType"] == (
        "content_artifact"
    )


@pytest.mark.asyncio
async def test_compile_scope_v3_assistant_reference_cannot_select_checklist_type(
) -> None:
    envelope = _envelope_with_context(
        current_owner=(
            "Please continue working with the staged pilot exactly as discussed."
        ),
        prior_owner="Create an operational plan for the staged pilot.",
        assistant_reference="Replace it with a concise checklist for the staged pilot.",
    )
    drafter = _ArtifactDrafter(
        artifact_type="content_artifact",
        deliverable="Concise checklist for the staged pilot",
    )

    result = await GeminiCognitiveExecutor(drafter, AUTHORITY_KEY).execute(envelope)

    assert result.artifact.payload["deliverableProfile"]["artifactType"] == (
        "operational_plan"
    )


@pytest.mark.asyncio
async def test_compile_scope_v3_operational_plan_containing_checklist_stays_plan(
) -> None:
    deliverable = "Operational plan containing a checklist for the staged pilot"
    envelope = _envelope_with_context(
        current_owner=f"Create an {deliverable}.",
        prior_owner="Draft a checklist for the staged pilot.",
        assistant_reference="A standalone checklist would be concise.",
    )
    drafter = _ArtifactDrafter(
        artifact_type="content_artifact",
        deliverable=deliverable,
    )

    result = await GeminiCognitiveExecutor(drafter, AUTHORITY_KEY).execute(envelope)

    assert result.artifact.payload["deliverableProfile"]["artifactType"] == (
        "operational_plan"
    )


def test_revision_without_new_artifact_intent_preserves_prior_type() -> None:
    profile = _draft("staged pilot", topic="staged pilot", start=0).deliverable_profile

    artifact_type = _canonical_artifact_type(
        "Make the wording more concise without changing the deliverable.",
        profile,
        ["Concise checklist for the staged pilot"],
        prior_artifact_type="content_artifact",
    )

    assert artifact_type == "content_artifact"


def test_plan_wording_does_not_override_a_non_checklist_model_type() -> None:
    profile = _draft("staged pilot", topic="staged pilot", start=0).deliverable_profile
    profile = profile.model_copy(update={"artifact_type": "product_prd"})

    artifact_type = _canonical_artifact_type(
        "Create an EU launch plan for the staged pilot.",
        profile,
        ["EU launch plan for the staged pilot"],
    )

    assert artifact_type == "product_prd"


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
