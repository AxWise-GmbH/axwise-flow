from __future__ import annotations

import hashlib
import json
import subprocess
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from backend.domain.workflow_v2.contracts import (
    AxWiseOperationEnvelope,
    CompileScopeInputV3,
    CompletionResult,
    EvidenceAcquisitionPassV1,
    EvidenceClaimV1,
    EvidenceRequirement,
    OperationEvent,
    OperationEventPage,
    OperationMetrics,
    PlanningResultV2,
    ResearchResultV2,
    ResearchSourceV1,
    SelectedEvidenceArtifactV1,
    SourceSpan,
    SynthesizeArtifactInputV1,
    WorkflowOutputContractV1,
    WorkflowOutputContractV2,
    artifact_content_hash,
    canonical_hash,
    canonical_json,
    render_assistant_context_request,
    utf16_length,
    utf16_slice,
)
from backend.services.workflow_v2.operation_store import _stored_envelope_payload
from backend.tests.workflow_v2.factories import scope_payload

pytestmark = pytest.mark.contract
GOLDEN = Path(__file__).with_name("fixtures") / "canonical_v1_golden.json"
COMPILE_SCOPE_ENVELOPE = (
    Path(__file__).with_name("fixtures") / "compile_scope_envelope_v2.json"
)
COMPILE_SCOPE_V3_ENVELOPE = (
    Path(__file__).with_name("fixtures") / "compile_scope_envelope_v3.json"
)
SYNTHESIZE_ARTIFACT_GOLDEN = (
    Path(__file__).with_name("fixtures") / "synthesize_artifact_v1_golden.json"
)
ASSISTANT_MIGRATION = (
    Path(__file__).parents[2] / "database" / "workflow_v2" / "002_assistant_turn.sql"
)
ASSISTANT_RUNTIME_MIGRATION = (
    Path(__file__).parents[2]
    / "database"
    / "workflow_v2"
    / "003_assistant_runtime.sql"
)
OPERATION_EVENTS_MIGRATION = (
    Path(__file__).parents[2]
    / "database"
    / "workflow_v2"
    / "004_operation_events.sql"
)
PREVIEW_SCHEMA_APPLY = (
    Path(__file__).parents[3]
    / "deploy"
    / "workflow-v2"
    / "apply-preview-schema.sh"
)


def test_assistant_migration_does_not_use_reserved_constraint_alias() -> None:
    migration = ASSISTANT_MIGRATION.read_text(encoding="utf-8")
    assert "FROM pg_constraint AS candidate" in migration
    assert "AS constraint" not in migration


def test_operation_metrics_model_version_is_additive_for_legacy_replay() -> None:
    legacy = OperationMetrics.model_validate(
        {
            "latencyMs": 7,
            "provider": "google",
            "model": "gemini-3.7-flash",
        }
    )
    current = OperationMetrics.model_validate(
        {
            "latencyMs": 9,
            "provider": "google",
            "model": "gemini-3.8-flash",
            "modelVersion": "gemini-3.8-flash-001",
        }
    )

    assert legacy.model_version is None
    assert "modelVersion" not in legacy.model_dump(
        mode="json", by_alias=True, exclude_unset=True
    )
    assert current.model == "gemini-3.8-flash"
    assert current.model_version == "gemini-3.8-flash-001"
    assert current.model_dump(mode="json", by_alias=True)["modelVersion"] == (
        "gemini-3.8-flash-001"
    )


def test_assistant_runtime_migration_is_additive_and_content_free() -> None:
    migration = ASSISTANT_RUNTIME_MIGRATION.read_text(encoding="utf-8")

    assert "ADD COLUMN retry_at timestamptz NULL" in migration
    assert "ADD COLUMN retry_after_seconds integer NULL" in migration
    assert "ADD COLUMN failure_diagnostics jsonb NULL" in migration
    assert (
        "uuid, uuid, uuid, boolean, text, timestamptz, integer, jsonb"
        in migration
    )
    assert "DROP FUNCTION" not in migration
    assert "prompt" not in migration.casefold()
    assert "response_body" not in migration.casefold()
    assert "p_value ? 'route'" in migration
    assert "p_value ? 'status'" in migration
    assert "COALESCE((" in migration


def test_operation_events_migration_is_append_only_and_has_no_provider_circuit() -> None:
    migration = OPERATION_EVENTS_MIGRATION.read_text(encoding="utf-8")

    assert "CREATE TABLE axwise.operation_events" in migration
    assert "operation lifecycle events are append-only" in migration
    assert "event_sequence = value.event_sequence + 1" in migration
    assert "request_cognitive_operation_cancel" in migration
    assert "cancel_cognitive_operation" in migration
    assert "ENABLE ROW LEVEL SECURITY" in migration
    assert "provider_circuit" not in migration


def test_preview_schema_apply_advances_and_marks_all_additive_migrations() -> None:
    script = PREVIEW_SCHEMA_APPLY.read_text(encoding="utf-8")
    subprocess.run(["bash", "-n", str(PREVIEW_SCHEMA_APPLY)], check=True)

    for migration in (
        "002_assistant_turn.sql",
        "003_assistant_runtime.sql",
        "004_operation_events.sql",
    ):
        assert migration in script
    assert "expected_relations_with_events" in script
    assert "axwise.operation_events" in script
    assert "expected_release_marker" in script
    assert "events_migration_path" in script
    fresh_apply = script[script.index('if test "${user_schemas}" != public'):]
    assert fresh_apply.index('"${ASSISTANT_MIGRATION}"') < fresh_apply.index(
        '"${RUNTIME_MIGRATION}"'
    )
    assert fresh_apply.index('"${RUNTIME_MIGRATION}"') < fresh_apply.index(
        '"${EVENTS_MIGRATION}"'
    )
    assert fresh_apply.index('"${EVENTS_MIGRATION}"') < fresh_apply.index(
        '"${BINDINGS}"'
    )


def test_operation_event_contract_enforces_monotonic_typed_lifecycle() -> None:
    operation_id = "00000000-0000-4000-8000-000000000777"
    event = OperationEvent.model_validate(
        {
            "operationId": operation_id,
            "sequence": 3,
            "eventType": "cancel_requested",
            "status": "cancel_requested",
            "occurredAt": "2026-09-02T10:15:30Z",
        }
    )
    page = OperationEventPage(
        operation_id=operation_id,
        after=2,
        next_after=3,
        has_more=False,
        events=[event],
    )

    assert page.next_after == 3
    with pytest.raises(ValidationError):
        OperationEvent.model_validate(
            {
                "operationId": operation_id,
                "sequence": 4,
                "eventType": "completed",
                "status": "failed",
                "occurredAt": "2026-09-02T10:15:31Z",
            }
        )


def test_canonical_v1_shared_golden_vectors_and_utf16_span() -> None:
    fixture = json.loads(GOLDEN.read_text(encoding="utf-8"))
    for vector in fixture["vectors"]:
        assert canonical_json(vector["value"]) == vector["canonical"]
        assert canonical_hash(vector["value"]) == vector["sha256"]

    span = fixture["sourceSpan"]
    exact = utf16_slice(span["source"], span["start"], span["end"])
    assert exact == span["text"]
    assert hashlib.sha256(exact.encode("utf-8")).hexdigest() == span["sha256"]
    assert SourceSpan.model_validate(
        {key: value for key, value in span.items() if key != "source"}
    ).offset_unit == "utf16_code_units"


@pytest.mark.parametrize(
    "value",
    [
        1.5,
        9_007_199_254_740_992,
        "\ud800",
        "\udc00",
        {"\ud800": "bad"},
        ("tuple-is-not-json",),
    ],
)
def test_canonical_v1_rejects_cross_language_ambiguity(value) -> None:
    with pytest.raises(TypeError):
        canonical_json(value)


def test_compile_scope_envelope_matches_shared_javascript_fixture() -> None:
    fixture = json.loads(COMPILE_SCOPE_ENVELOPE.read_text(encoding="utf-8"))
    envelope = AxWiseOperationEnvelope.model_validate(fixture)

    assert envelope.operation_type == "CompileScopeV2"
    assert "mode" not in fixture["input"]
    assert fixture["input"]["safeDefaults"] == {
        "geography": [],
        "acceptedSourceTypes": [],
        "assumptions": [],
        "limits": [],
        "policies": [],
    }
    assert canonical_hash(fixture["input"]) == fixture["canonicalInputHash"]


def test_compile_scope_v3_envelope_matches_shared_javascript_fixture() -> None:
    fixture_bytes = COMPILE_SCOPE_V3_ENVELOPE.read_bytes()
    fixture = json.loads(fixture_bytes.decode("utf-8"))
    envelope = AxWiseOperationEnvelope.model_validate(fixture)
    input_value = envelope.input

    assert isinstance(input_value, CompileScopeInputV3)
    assert envelope.operation_type == "CompileScopeV3"
    assert input_value.assistant_context.envelope_hash == (
        "2428b5d28b484e28fe38d50d1aba5c72026763faa178dd95736891b3adc50a6e"
    )
    assert envelope.canonical_input_hash == (
        "47f22aaf2746e6add69a7d0c590926dd6130b60baaecdcb100302117114bd7c0"
    )
    assert render_assistant_context_request(input_value.assistant_context) == (
        input_value.request
    )
    assert utf16_length(input_value.assistant_context.instruction.content) == 32
    assert input_value.assistant_context.turns[0].user.source_span.start == 46
    assert input_value.assistant_context.turns[0].assistant.source_span.start == 103
    assert canonical_hash(fixture["input"]) == fixture["canonicalInputHash"]
    assert envelope.model_dump(mode="json", by_alias=True) == fixture
    assert hashlib.sha256(fixture_bytes).hexdigest() == (
        "5cd46e817322d5193b1d68f99ba93de0669a350547f987e1482bb73d532a8c73"
    )


def test_compile_scope_v3_accepts_canonical_mixed_content_kind_order() -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["assistantContext"]["turns"][0]["user"][
        "contentKinds"
    ] = ["text", "artifact"]
    _rebind_compile_scope_v3_fixture(fixture)

    parsed = AxWiseOperationEnvelope.model_validate(fixture)

    assert parsed.input.assistant_context.turns[0].user.content_kinds == [
        "text",
        "artifact",
    ]


def _rebind_compile_scope_v3_fixture(fixture: dict) -> None:
    context = fixture["input"]["assistantContext"]
    context["envelopeHash"] = canonical_hash(
        {key: value for key, value in context.items() if key != "envelopeHash"}
    )
    fixture["canonicalInputHash"] = canonical_hash(fixture["input"])


def _execution_agent_profile_snapshot(agent_id: str) -> dict:
    profile = {
        "version": "orqaly_agent_profile_input_v1",
        "displayName": "Research Scout",
        "roleLabel": "Evidence researcher",
        "description": "Finds defensible primary evidence.",
        "instructions": "Prefer primary sources and state material uncertainty.",
        "avatar": {"kind": "emoji", "value": "🧭", "color": "#365E8D"},
    }
    return {
        "version": "orqaly_execution_agent_profile_snapshot_v1",
        "profileVersion": {
            "version": "orqaly_agent_profile_v1",
            "id": "10000000-0000-4000-8000-000000000407",
            "agentId": agent_id,
            "versionNumber": 7,
            "contentHash": canonical_hash(profile),
        },
        "profile": profile,
    }


def _execution_agent_v1(fixture: dict, *, with_profile: bool = False) -> dict:
    context = fixture["input"]["assistantContext"]
    instruction = context["instruction"]["content"]
    agent = {
        "schemaVersion": "orqaly.execution-agent.v1",
        "id": "10000000-0000-4000-8000-000000000406",
        "runId": fixture["workflow"]["runId"],
        "owner": {
            "tenantId": fixture["owner"]["tenantId"],
            "userId": fixture["owner"]["userId"],
        },
        "lifetime": "temporary",
        "source": {
            "threadId": context["threadId"],
            "turnId": context["currentTurnId"],
            "taskHash": hashlib.sha256(instruction.encode("utf-8")).hexdigest(),
        },
        "executorPersona": {
            "role": "task_executor",
            "profileVersion": "axwise_executor_persona_v1",
            "provider": "axwise",
            "binding": "fixed_profile_contract",
        },
        "memory": {"scope": "thread_and_goal", "crossThread": False},
        "runtime": {
            "provider": "orqaly_workflow_v2",
            "isolation": "tenant_user",
        },
        "capabilities": {
            "research": True,
            "planning": True,
            "artifactProduction": True,
            "approvalGates": True,
        },
        "tools": {"externalActions": False, "executionProvider": None},
    }
    if with_profile:
        agent["profileSnapshot"] = _execution_agent_profile_snapshot(agent["id"])
    return agent


def test_compile_scope_v3_accepts_exact_truthful_execution_agent_contract() -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["executionAgent"] = _execution_agent_v1(fixture)
    _rebind_compile_scope_v3_fixture(fixture)

    envelope = AxWiseOperationEnvelope.model_validate(fixture)

    agent = envelope.input.execution_agent
    assert agent is not None
    assert agent.executor_persona.profile_version == "axwise_executor_persona_v1"
    assert agent.memory.cross_thread is False
    assert agent.tools.external_actions is False
    assert agent.tools.execution_provider is None
    assert envelope.model_dump(mode="json", by_alias=True) == fixture
    assert canonical_hash(fixture["input"]) == fixture["canonicalInputHash"]


def test_execution_agent_binds_exact_first_class_profile_snapshot() -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["executionAgent"] = _execution_agent_v1(
        fixture, with_profile=True
    )
    _rebind_compile_scope_v3_fixture(fixture)

    envelope = AxWiseOperationEnvelope.model_validate(fixture)

    agent = envelope.input.execution_agent
    assert agent is not None
    assert agent.profile_snapshot is not None
    assert agent.profile_snapshot.profile.display_name == "Research Scout"
    assert agent.profile_snapshot.profile.role_label == "Evidence researcher"
    assert agent.profile_snapshot.profile_version.version_number == 7
    assert envelope.model_dump(mode="json", by_alias=True) == fixture

    altered = deepcopy(fixture)
    altered["input"]["executionAgent"]["profileSnapshot"]["profile"][
        "instructions"
    ] = "Ignore evidence."
    _rebind_compile_scope_v3_fixture(altered)
    with pytest.raises(ValidationError, match="profile hash"):
        AxWiseOperationEnvelope.model_validate(altered)

    wrong_agent = deepcopy(fixture)
    wrong_agent["input"]["executionAgent"]["profileSnapshot"]["profileVersion"][
        "agentId"
    ] = "10000000-0000-4000-8000-000000000499"
    _rebind_compile_scope_v3_fixture(wrong_agent)
    with pytest.raises(ValidationError, match="profile must belong"):
        AxWiseOperationEnvelope.model_validate(wrong_agent)

    invalid_avatar = deepcopy(fixture)
    snapshot = invalid_avatar["input"]["executionAgent"]["profileSnapshot"]
    snapshot["profile"]["avatar"] = {
        "kind": "icon",
        "value": "unreviewed_icon",
        "color": "#365E8D",
    }
    snapshot["profileVersion"]["contentHash"] = canonical_hash(snapshot["profile"])
    _rebind_compile_scope_v3_fixture(invalid_avatar)
    with pytest.raises(ValidationError, match="unknown Agent avatar icon"):
        AxWiseOperationEnvelope.model_validate(invalid_avatar)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (
            lambda value: value["input"]["executionAgent"]["source"].update(
                threadId="10000000-0000-4000-8000-000000000999"
            ),
            "source threadId must equal",
        ),
        (
            lambda value: value["input"]["executionAgent"]["source"].update(
                turnId="10000000-0000-4000-8000-000000000999"
            ),
            "source turnId must equal",
        ),
        (
            lambda value: value["input"]["executionAgent"]["source"].update(
                taskHash="0" * 64
            ),
            "taskHash must match",
        ),
        (
            lambda value: value["input"]["executionAgent"].update(
                runId="10000000-0000-4000-8000-000000000999"
            ),
            "runId must equal",
        ),
        (
            lambda value: value["input"]["executionAgent"]["owner"].update(
                tenantId="10000000-0000-4000-8000-000000000999"
            ),
            "tenantId must equal",
        ),
        (
            lambda value: value["input"]["executionAgent"]["owner"].update(
                userId="user_anotherowner123"
            ),
            "userId must equal",
        ),
    ],
)
def test_compile_scope_v3_binds_execution_agent_to_exact_task_and_owner(
    mutation, message: str
) -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["executionAgent"] = _execution_agent_v1(fixture)
    mutation(fixture)
    _rebind_compile_scope_v3_fixture(fixture)

    with pytest.raises(ValidationError, match=message):
        AxWiseOperationEnvelope.model_validate(fixture)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda agent: agent["executorPersona"].update(
            profileVersion="axwise_executor_persona_v2"
        ),
        lambda agent: agent["executorPersona"].update(
            binding="dynamically_generated"
        ),
        lambda agent: agent["memory"].update(crossThread=True),
        lambda agent: agent["memory"].update(crossThread=0),
        lambda agent: agent["runtime"].update(isolation="shared"),
        lambda agent: agent["capabilities"].update(research=False),
        lambda agent: agent["capabilities"].update(research=1),
        lambda agent: agent["tools"].update(externalActions=True),
        lambda agent: agent["tools"].update(externalActions=0),
        lambda agent: agent["tools"].update(executionProvider="n8n"),
        lambda agent: agent["executorPersona"].update(
            profile_version=agent["executorPersona"].pop("profileVersion")
        ),
    ],
)
def test_compile_scope_v3_rejects_execution_agent_capability_or_wire_drift(
    mutation,
) -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    agent = _execution_agent_v1(fixture)
    mutation(agent)
    fixture["input"]["executionAgent"] = agent
    _rebind_compile_scope_v3_fixture(fixture)

    with pytest.raises(ValidationError):
        AxWiseOperationEnvelope.model_validate(fixture)


def _operation_with_execution_agent(input_payload: dict, operation_type: str) -> dict:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    agent = _execution_agent_v1(fixture, with_profile=True)
    owner = {
        "tenantId": "20000000-0000-4000-8000-000000000002",
        "organizationId": None,
        "userId": "user_executionagentstage123",
    }
    workflow = {
        "runId": "20000000-0000-4000-8000-000000000003",
        "stageId": "20000000-0000-4000-8000-000000000004",
        "stageAttemptId": "20000000-0000-4000-8000-000000000005",
    }
    agent["runId"] = workflow["runId"]
    agent["owner"] = {
        "tenantId": owner["tenantId"],
        "userId": owner["userId"],
    }
    typed_input = {**input_payload, "executionAgent": agent}
    return {
        "operationId": "20000000-0000-4000-8000-000000000001",
        "operationType": operation_type,
        "owner": owner,
        "workflow": workflow,
        "contractVersion": "axwise.operation.v2",
        "canonicalInputHash": canonical_hash(typed_input),
        "input": typed_input,
    }


def test_execution_agent_is_canonically_bound_to_every_goal_operation_stage() -> None:
    correction = "Keep the scope and make the result concise."
    correction_hash = hashlib.sha256(correction.encode("utf-8")).hexdigest()
    scope = scope_payload()
    inputs = [
        (
            "ReviseScopeV2",
            {
                "type": "ReviseScopeV2",
                "acceptedScope": {
                    "artifactId": "20000000-0000-4000-8000-000000000011",
                    "artifactHash": "a" * 64,
                    "kind": "scope",
                },
                "correction": correction,
                "correctionSourceSpans": [
                    {
                        "start": 0,
                        "end": len(correction),
                        "offsetUnit": "utf16_code_units",
                        "text": correction,
                        "sha256": correction_hash,
                    }
                ],
            },
        ),
        (
            "ExecuteResearchV2",
            {
                "type": "ExecuteResearchV2",
                "acceptedScope": {
                    "artifactId": "20000000-0000-4000-8000-000000000011",
                    "artifactHash": "a" * 64,
                    "kind": "scope",
                },
                "scope": scope,
                "selectedEvidence": [],
            },
        ),
    ]
    synthesis_fixture = json.loads(SYNTHESIZE_ARTIFACT_GOLDEN.read_text(encoding="utf-8"))
    inputs.extend(
        ("SynthesizeArtifactV1", case["input"])
        for case in synthesis_fixture["cases"]
    )

    for operation_type, input_payload in inputs:
        payload = _operation_with_execution_agent(input_payload, operation_type)
        envelope = AxWiseOperationEnvelope.model_validate(payload)
        serialized = envelope.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        )

        assert serialized["input"]["executionAgent"] == payload["input"][
            "executionAgent"
        ]
        assert canonical_hash(serialized["input"]) == payload["canonicalInputHash"]


@pytest.mark.parametrize(
    "mutation, message",
    [
        (
            lambda value: value["input"]["assistantContext"]["turns"][0][
                "user"
            ].update(contentKinds=["artifact", "text"]),
            "canonical text/artifact order",
        ),
        (
            lambda value: value["input"]["assistantContext"]["turns"][0][
                "assistant"
            ].update(provenance="orqaly_local_output"),
            "provenance must match",
        ),
        (
            lambda value: value["input"]["assistantContext"]["turns"][0][
                "user"
            ]["sourceSpan"].update(start=47),
            "exact rendered content offsets",
        ),
        (
            lambda value: value["input"]["assistantContext"].update(
                currentTurnId=value["input"]["assistantContext"]["turns"][0][
                    "assistant"
                ]["turnId"]
            ),
            "turn identities must not overlap",
        ),
    ],
)
def test_compile_scope_v3_rejects_noncanonical_context(
    mutation, message: str
) -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    mutation(fixture)
    _rebind_compile_scope_v3_fixture(fixture)

    with pytest.raises(ValidationError, match=message):
        AxWiseOperationEnvelope.model_validate(fixture)


def test_compile_scope_v3_rejects_tampered_envelope_and_content_hashes() -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["assistantContext"]["turns"][0]["user"][
        "contentSha256"
    ] = "f" * 64
    fixture["canonicalInputHash"] = canonical_hash(fixture["input"])

    with pytest.raises(ValidationError, match="content hash does not match"):
        AxWiseOperationEnvelope.model_validate(fixture)

    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    fixture["input"]["assistantContext"]["omittedTurnCount"] = 1
    fixture["canonicalInputHash"] = canonical_hash(fixture["input"])
    with pytest.raises(ValidationError, match="envelope hash does not match"):
        AxWiseOperationEnvelope.model_validate(fixture)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda value: value["input"].update(
            assistant_context=value["input"].pop("assistantContext")
        ),
        lambda value: value["input"]["assistantContext"]["turns"][0][
            "user"
        ]["sourceSpan"].pop("offsetUnit"),
        lambda value: value["input"]["assistantContext"].update(
            omittedTurnCount="0"
        ),
        lambda value: value["input"]["assistantContext"]["turns"][0][
            "user"
        ].update(truncated="false"),
        lambda value: value["input"]["assistantContext"].update(
            threadId="urn:uuid:10000000-0000-4000-8000-000000000001"
        ),
    ],
)
def test_compile_scope_v3_rejects_noncanonical_wire_coercions(mutation) -> None:
    fixture = json.loads(COMPILE_SCOPE_V3_ENVELOPE.read_text(encoding="utf-8"))
    mutation(fixture)

    with pytest.raises(ValidationError):
        AxWiseOperationEnvelope.model_validate(fixture)


def test_assistant_turn_envelope_is_typed_and_canonically_bound() -> None:
    input_payload = {
        "type": "AssistantTurnV1",
        "responseMode": "one_shot",
        "message": "Compare two bounded options.",
        "conversation": [
            {"role": "user", "content": "I care most about reliability."}
        ],
    }
    envelope = AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000921",
            "operationType": "AssistantTurnV1",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000922",
                "organizationId": None,
                "userId": "user_assistantcontract123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000923",
                "stageId": "00000000-0000-4000-8000-000000000924",
                "stageAttemptId": "00000000-0000-4000-8000-000000000925",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": canonical_hash(input_payload),
            "input": input_payload,
        }
    )

    assert envelope.operation_type == "AssistantTurnV1"
    assert envelope.model_dump(mode="json", by_alias=True)["input"] == input_payload


def test_synthesize_artifact_inputs_and_results_match_shared_javascript_golden() -> None:
    fixture = json.loads(SYNTHESIZE_ARTIFACT_GOLDEN.read_text(encoding="utf-8"))
    result_adapter = TypeAdapter(CompletionResult)
    assert [case["name"] for case in fixture["cases"]] == [
        "execute_task",
        "evaluate_output_repair",
        "evaluate_output_direct_promotion",
        "final_synthesis",
        "blocked_report",
    ]
    for case in fixture["cases"]:
        parsed_input = SynthesizeArtifactInputV1.model_validate(case["input"])
        assert canonical_hash(case["input"]) == case["canonicalInputHash"]
        assert parsed_input.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        ) == case["input"]
        envelope = AxWiseOperationEnvelope.model_validate(
            {
                "operationId": "00000000-0000-4000-8000-000000000901",
                "operationType": "SynthesizeArtifactV1",
                "owner": {
                    "tenantId": "00000000-0000-4000-8000-000000000902",
                    "organizationId": None,
                    "userId": "user_goldencontract123",
                },
                "workflow": {
                    "runId": "00000000-0000-4000-8000-000000000903",
                    "stageId": "00000000-0000-4000-8000-000000000904",
                    "stageAttemptId": "00000000-0000-4000-8000-000000000905",
                },
                "contractVersion": "axwise.operation.v2",
                "canonicalInputHash": case["canonicalInputHash"],
                "input": case["input"],
            }
        )
        assert envelope.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        )["input"] == case["input"]
        assert all(
            key not in case["input"]
            for key in {
                "acceptedPlan",
                "task",
                "taskArtifacts",
                "evaluation",
            }
            - {
                "execute_task": {"acceptedPlan", "task"},
                "evaluate_output": {"acceptedPlan", "taskArtifacts"},
                "final_synthesis": {
                    "acceptedPlan",
                    "taskArtifacts",
                    "evaluation",
                },
                "blocked_report": set(),
            }[case["purpose"]]
        )
        parsed_result = result_adapter.validate_python(case["result"])
        assert parsed_result.model_dump(
            mode="json", by_alias=True, exclude_unset=True
        ) == case["result"]


def _synthesis_case(name: str) -> dict:
    fixture = json.loads(SYNTHESIZE_ARTIFACT_GOLDEN.read_text(encoding="utf-8"))
    return deepcopy(next(case for case in fixture["cases"] if case["name"] == name))


def _change_top_level_reference_kind(
    value: dict, field: str, kind: str, *, index: int | None = None
) -> None:
    reference = value[field] if index is None else value[field][index]
    artifact_id = reference["artifactId"]
    reference["kind"] = kind
    for source in value["sourceArtifacts"]:
        if source["artifactId"] == artifact_id:
            source["kind"] = kind
    for content in value["artifactContents"]:
        if content["artifact"]["artifactId"] == artifact_id:
            content["artifact"]["kind"] = kind


@pytest.mark.parametrize(
    ("case_name", "field", "index", "wrong_kind"),
    [
        ("execute_task", "acceptedScope", None, "task_result"),
        ("execute_task", "research", None, "scope"),
        ("execute_task", "acceptedPlan", None, "research"),
        ("evaluate_output_repair", "taskArtifacts", 0, "evaluation"),
        ("final_synthesis", "evaluation", None, "task_result"),
    ],
)
def test_synthesize_purpose_boundary_rejects_wrong_artifact_kinds(
    case_name: str, field: str, index: int | None, wrong_kind: str
) -> None:
    input_payload = _synthesis_case(case_name)["input"]
    _change_top_level_reference_kind(
        input_payload, field, wrong_kind, index=index
    )

    with pytest.raises(ValidationError):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_synthesize_source_appendix_authority_equals_research_catalogue() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    assert input_payload["outputContract"]["sourceAppendixRequired"] is False
    input_payload["outputContract"]["sourceAppendixRequired"] = True

    with pytest.raises(ValidationError, match="source appendix authority"):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_execute_task_requires_exact_core_references_not_matching_ids_only() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    input_payload["acceptedScope"]["artifactHash"] = "f" * 64

    with pytest.raises(ValidationError, match="scope, research, plan"):
        SynthesizeArtifactInputV1.model_validate(input_payload)


def test_operation_store_normalizes_defaults_but_preserves_strict_synthesis_omission() -> None:
    explicit_payload = json.loads(COMPILE_SCOPE_ENVELOPE.read_text(encoding="utf-8"))
    omitted_payload = deepcopy(explicit_payload)
    omitted_payload["input"].pop("objectiveOnlyContext")
    omitted_payload["input"].pop("safeDefaults")
    explicit = AxWiseOperationEnvelope.model_validate(explicit_payload)
    omitted = AxWiseOperationEnvelope.model_validate(omitted_payload)

    assert _stored_envelope_payload(explicit) == _stored_envelope_payload(omitted)

    synthesis_case = _synthesis_case("evaluate_output_repair")
    synthesis = AxWiseOperationEnvelope.model_validate(
        {
            "operationId": "00000000-0000-4000-8000-000000000911",
            "operationType": "SynthesizeArtifactV1",
            "owner": {
                "tenantId": "00000000-0000-4000-8000-000000000912",
                "organizationId": None,
                "userId": "user_storecontract123",
            },
            "workflow": {
                "runId": "00000000-0000-4000-8000-000000000913",
                "stageId": "00000000-0000-4000-8000-000000000914",
                "stageAttemptId": "00000000-0000-4000-8000-000000000915",
            },
            "contractVersion": "axwise.operation.v2",
            "canonicalInputHash": synthesis_case["canonicalInputHash"],
            "input": synthesis_case["input"],
        }
    )
    stored = _stored_envelope_payload(synthesis)
    assert stored["input"] == synthesis_case["input"]
    scope_payload = next(
        content["payload"]
        for content in stored["input"]["artifactContents"]
        if content["artifact"]["kind"] == "scope"
    )
    assert "materialClarification" in scope_payload
    assert scope_payload["materialClarification"] is None


def test_planning_result_rejects_dependency_cycles() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    plan = deepcopy(
        next(
            content["payload"]
            for content in input_payload["artifactContents"]
            if content["artifact"]["kind"] == "plan"
        )
    )
    core = next(task for task in plan["tasks"] if task["taskKind"] == "core_draft")
    specialist = next(
        task for task in plan["tasks"] if task["taskKind"] == "specialist_analysis"
    )
    specialist["dependsOnStageKeys"] = [core["stageKey"]]
    for task in plan["tasks"]:
        task["inputHash"] = canonical_hash(
            {key: value for key, value in task.items() if key != "inputHash"}
        )
    plan["planHash"] = canonical_hash(
        {key: value for key, value in plan.items() if key != "planHash"}
    )

    with pytest.raises(ValidationError, match="acyclic DAG"):
        PlanningResultV2.model_validate(plan)


def _claim(text: str, response: str) -> dict:
    source_types = ["grounded_web"]
    source_urls = ["https://example.test/source"]
    response_bytes = response.encode("utf-8")
    claim_bytes = text.encode("utf-8")
    start = response_bytes.index(claim_bytes)
    return {
        "claimId": canonical_hash(
            {"text": text, "sourceTypes": source_types, "sourceUrls": source_urls}
        ),
        "text": text,
        "textSha256": hashlib.sha256(claim_bytes).hexdigest(),
        "sourceUrls": source_urls,
        "sourceTypes": source_types,
        "providerResponseHash": hashlib.sha256(response_bytes).hexdigest(),
        "segmentStart": start,
        "segmentEnd": start + len(claim_bytes),
        "offsetUnit": "utf8_bytes",
    }


def test_acquisition_claim_proves_exact_utf8_provider_response_slice() -> None:
    response = "Prefix — exact 😀 claim — suffix"
    claim = _claim("exact 😀 claim", response)
    parsed = EvidenceAcquisitionPassV1.model_validate(
        {
            "requirementId": "market-fact",
            "passNumber": 0,
            "queryHash": "a" * 64,
            "providerResponseHash": hashlib.sha256(response.encode("utf-8")).hexdigest(),
            "providerResponseText": response,
            "claims": [claim],
            "sourceTypesSeen": ["grounded_web"],
        }
    )
    assert parsed.claims == [EvidenceClaimV1.model_validate(claim)]

    changed = parsed.model_dump(mode="json", by_alias=True)
    changed["providerResponseText"] = response.replace("claim", "claimX")
    with pytest.raises(ValidationError, match="provider response hash"):
        EvidenceAcquisitionPassV1.model_validate(changed)


def test_evidence_claim_rejects_noncanonical_or_private_source_url() -> None:
    claim = _claim("Exact claim", "Exact claim")
    claim["sourceUrls"] = ["https://127.0.0.1/private"]
    claim["claimId"] = canonical_hash(
        {
            "text": claim["text"],
            "sourceTypes": claim["sourceTypes"],
            "sourceUrls": claim["sourceUrls"],
        }
    )

    with pytest.raises(ValidationError, match="canonical public HTTPS"):
        EvidenceClaimV1.model_validate(claim)


def test_blocking_requirement_needs_an_authoritative_source_class() -> None:
    with pytest.raises(ValidationError, match="authoritative accepted source"):
        EvidenceRequirement.model_validate(
            {
                "id": "unsafe-block",
                "claimType": "commercial_offer",
                "description": "A commercial detail cannot globally block delivery.",
                "criticality": "blocking",
                "evidenceRole": "grounded_claim",
                "verificationBasis": "grounded_claims",
                "appliesWhen": "always",
                "acceptedSourceTypes": ["grounded_web", "industry"],
            }
        )


def test_evidence_requirement_requires_typed_verification_basis() -> None:
    base = {
        "id": "exact-product-proof",
        "claimType": "product_certificate",
        "description": "An exact product certificate.",
        "criticality": "blocking",
        "evidenceRole": "selected_artifact_proof",
        "appliesWhen": "before launch",
        "acceptedSourceTypes": ["government", "standard"],
    }
    with pytest.raises(ValidationError, match="Field required"):
        EvidenceRequirement.model_validate(base)

    parsed = EvidenceRequirement.model_validate(
        {**base, "verificationBasis": "selected_evidence"}
    )
    assert parsed.verification_basis == "selected_evidence"


@pytest.mark.parametrize(
    ("evidence_role", "verification_basis"),
    [
        ("grounded_claim", "selected_evidence"),
        ("selected_artifact_proof", "grounded_claims"),
        ("future_authorization_proof", "grounded_claims"),
    ],
)
def test_evidence_role_fail_closed_to_its_typed_verification_basis(
    evidence_role: str,
    verification_basis: str,
) -> None:
    with pytest.raises(ValidationError, match="exact typed verificationBasis"):
        EvidenceRequirement.model_validate(
            {
                "id": "typed-evidence-role",
                "claimType": "product_safety_record",
                "description": "Verify the exact evidence using its typed authority.",
                "criticality": "blocking",
                "evidenceRole": evidence_role,
                "verificationBasis": verification_basis,
                "appliesWhen": "The accepted scope requires the fact.",
                "acceptedSourceTypes": ["government", "standard"],
            }
        )


def test_only_ready_launch_authorization_contract_can_allow_launch_readiness() -> None:
    requirement_id = "req-0123456789abcdef"
    criterion_core = {
        "given": "The exact accepted evidence is available.",
        "when": "The launch authorization is evaluated.",
        "then": "The decision binds the exact evidence without overclaiming.",
        "supports": [requirement_id],
    }
    base = {
        "format": "text/markdown",
        "requiredSections": ["Decision"],
        "requirementIds": [requirement_id],
        "rubric": ["Bind the exact evidence and decision."],
        "acceptanceCriteria": [
            {
                "id": f"acc-{canonical_hash(criterion_core)[:16]}",
                **criterion_core,
            }
        ],
        "evidenceReadiness": "ready",
        "sourceAppendixRequired": False,
    }

    WorkflowOutputContractV1.model_validate(
        {
            **base,
            "artifactType": "product_prd",
            "launchReadyAllowed": False,
        }
    )
    WorkflowOutputContractV1.model_validate(
        {
            **base,
            "artifactType": "launch_authorization",
            "launchReadyAllowed": True,
        }
    )
    with pytest.raises(ValidationError, match="ready launch_authorization"):
        WorkflowOutputContractV1.model_validate(
            {
                **base,
                "artifactType": "product_prd",
                "launchReadyAllowed": True,
            }
        )
    with pytest.raises(ValidationError, match="ready launch_authorization"):
        WorkflowOutputContractV1.model_validate(
            {
                **base,
                "artifactType": "launch_authorization",
                "launchReadyAllowed": False,
            }
        )


def test_output_contract_v2_is_tagged_strict_and_leaves_v1_byte_exact() -> None:
    requirement_id = "req-0123456789abcdef"
    criterion_core = {
        "given": "The owner requests one direct checklist.",
        "when": "The reader Markdown is published.",
        "then": "It contains exactly three checklist items within 100 words.",
        "supports": [requirement_id],
    }
    legacy_payload = {
        "format": "text/markdown",
        "artifactType": "content_artifact",
        "requiredSections": ["Checklist"],
        "requirementIds": [requirement_id],
        "rubric": ["Honor the accepted reader-facing format."],
        "acceptanceCriteria": [
            {
                "id": f"acc-{canonical_hash(criterion_core)[:16]}",
                **criterion_core,
            }
        ],
        "evidenceReadiness": "ready",
        "launchReadyAllowed": False,
        "sourceAppendixRequired": False,
    }
    legacy = WorkflowOutputContractV1.model_validate(legacy_payload)
    assert legacy.model_dump(
        mode="json", by_alias=True, exclude_unset=True
    ) == legacy_payload

    reader_output = {
        "schemaVersion": "orqaly.reader-output.v1",
        "readerFormat": {"value": "checklist", "requirementId": requirement_id},
        "wordLimit": {
            "maximumWords": 100,
            "basis": "owner_explicit",
            "requirementId": requirement_id,
        },
        "itemLimit": {
            "exactItems": 3,
            "itemKind": "checklist_item",
            "requirementId": requirement_id,
        },
        "measurement": {
            "scope": "reader_markdown_before_server_disclosures",
            "wordCounter": "unicode_words_v1",
            "itemCounter": "top_level_markdown_items_v1",
        },
    }
    current_payload = {
        **legacy_payload,
        "schemaVersion": "orqaly.markdown-output-contract.v2",
        "readerOutput": reader_output,
    }
    current = WorkflowOutputContractV2.model_validate(current_payload)
    assert current.model_dump(mode="json", by_alias=True) == current_payload

    with pytest.raises(ValidationError):
        WorkflowOutputContractV1.model_validate(current_payload)
    with pytest.raises(ValidationError, match="requirement IDs"):
        WorkflowOutputContractV2.model_validate(
            {
                **current_payload,
                "readerOutput": {
                    **reader_output,
                    "readerFormat": {
                        "value": "checklist",
                        "requirementId": "req-fedcba9876543210",
                    },
                },
            }
        )


def test_plan_v2_reader_output_requires_owner_requirement_provenance() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    plan = deepcopy(
        next(
            content["payload"]
            for content in input_payload["artifactContents"]
            if content["artifact"]["kind"] == "plan"
        )
    )
    owner_requirement = next(
        item for item in plan["requirements"] if item["authority"] == "owner"
    )
    derived_requirement = next(
        item for item in plan["requirements"] if item["authority"] != "owner"
    )
    plan["workShape"] = "content_artifact"
    plan["outputContract"] = {
        **plan["outputContract"],
        "schemaVersion": "orqaly.markdown-output-contract.v2",
        "artifactType": "content_artifact",
        "readerOutput": {
            "schemaVersion": "orqaly.reader-output.v1",
            "readerFormat": {
                "value": "checklist",
                "requirementId": owner_requirement["id"],
            },
            "wordLimit": None,
            "itemLimit": None,
            "measurement": {
                "scope": "reader_markdown_before_server_disclosures",
                "wordCounter": "unicode_words_v1",
                "itemCounter": "top_level_markdown_items_v1",
            },
        },
    }
    plan["planHash"] = canonical_hash(
        {key: value for key, value in plan.items() if key != "planHash"}
    )
    PlanningResultV2.model_validate(plan)

    plan["outputContract"]["readerOutput"]["readerFormat"]["requirementId"] = (
        derived_requirement["id"]
    )
    plan["planHash"] = canonical_hash(
        {key: value for key, value in plan.items() if key != "planHash"}
    )
    with pytest.raises(ValidationError, match="owner-authored"):
        PlanningResultV2.model_validate(plan)


@pytest.mark.parametrize(
    "host",
    [
        "127.0.0.1",
        "localhost",
        "service.local",
        "metadata.google.internal",
        "EXAMPLE.COM",
        "https://example.com",
        "*.example.com",
    ],
)
def test_evidence_requirement_rejects_nonpublic_or_noncanonical_allowed_hosts(
    host: str,
) -> None:
    with pytest.raises(ValidationError, match="allowed source host"):
        EvidenceRequirement.model_validate(
            {
                "id": "publisher-policy",
                "claimType": "publisher_restricted_fact",
                "description": "Use only the exact accepted publisher.",
                "criticality": "nonblocking",
                "evidenceRole": "grounded_claim",
                "verificationBasis": "grounded_claims",
                "appliesWhen": "the fact is included",
                "acceptedSourceTypes": ["grounded_web"],
                "allowedSourceHosts": [host],
            }
        )


def test_evidence_requirement_accepts_sorted_public_publisher_hosts() -> None:
    parsed = EvidenceRequirement.model_validate(
        {
            "id": "publisher-policy",
            "claimType": "publisher_restricted_fact",
            "description": "Use only the exact accepted publishers.",
            "criticality": "nonblocking",
            "evidenceRole": "grounded_claim",
            "verificationBasis": "grounded_claims",
            "appliesWhen": "the fact is included",
            "acceptedSourceTypes": ["grounded_web"],
            "allowedSourceHosts": ["eur-lex.europa.eu", "postgresql.org"],
        }
    )
    assert parsed.allowed_source_hosts == ["eur-lex.europa.eu", "postgresql.org"]


@pytest.mark.parametrize(
    "retrieval_date",
    [
        "2026-08-28T12:00:00+00:00",
        "2026-08-28T12:00Z",
        "2026-08-28 12:00:00Z",
        "2026-02-30T12:00:00Z",
        "2026-08-28T12:00:00.1234567Z",
    ],
)
def test_research_source_requires_exact_real_rfc3339_utc_timestamp(
    retrieval_date: str,
) -> None:
    core = {
        "sourceTitle": "Exact publisher snapshot",
        "canonicalUrl": "https://example.com/source",
        "sourceClasses": ["grounded_web"],
        "retrievalDate": retrieval_date,
    }
    with pytest.raises(ValidationError):
        ResearchSourceV1.model_validate(
            {
                "sourceId": canonical_hash(core),
                **core,
                "supportedClaimIds": ["a" * 64],
            }
        )


def test_source_catalogue_allows_distinct_snapshots_of_the_same_url() -> None:
    claim = _claim("Exact claim", "Exact claim")
    sources = []
    for title, retrieval_date in (
        ("Snapshot one", "2026-08-28T12:00:00Z"),
        ("Snapshot two", "2026-08-28T13:00:00.123456Z"),
    ):
        core = {
            "sourceTitle": title,
            "canonicalUrl": claim["sourceUrls"][0],
            "sourceClasses": ["grounded_web"],
            "retrievalDate": retrieval_date,
        }
        sources.append(
            {
                "sourceId": canonical_hash(core),
                **core,
                "supportedClaimIds": [claim["claimId"]],
            }
        )
    sources.sort(key=lambda source: source["sourceId"])
    parsed = SelectedEvidenceArtifactV1.model_validate(
        {
            "schemaVersion": "axwise.evidence.v1",
            "requirementId": "same-url-snapshots",
            "applicability": "applicable",
            "claims": [claim],
            "conflicts": [],
            "sourceCatalogue": sources,
        }
    )
    assert len(parsed.source_catalogue) == 2
    assert len({source.canonical_url for source in parsed.source_catalogue}) == 1


def test_not_applicable_selected_evidence_cannot_carry_claims_or_sources() -> None:
    claim = _claim("Exact claim", "Exact claim")
    core = {
        "sourceTitle": "Exact source",
        "canonicalUrl": claim["sourceUrls"][0],
        "sourceClasses": ["grounded_web"],
        "retrievalDate": "2026-08-28T12:00:00Z",
    }
    with pytest.raises(ValidationError, match="not-applicable evidence"):
        SelectedEvidenceArtifactV1.model_validate(
            {
                "schemaVersion": "axwise.evidence.v1",
                "requirementId": "not-applicable-fact",
                "applicability": "not_applicable",
                "claims": [claim],
                "conflicts": [],
                "sourceCatalogue": [
                    {
                        "sourceId": canonical_hash(core),
                        **core,
                        "supportedClaimIds": [claim["claimId"]],
                    }
                ],
            }
        )


def test_research_gap_and_conflict_summaries_are_exact_finding_derivations() -> None:
    input_payload = _synthesis_case("execute_task")["input"]
    research = deepcopy(
        next(
            content["payload"]
            for content in input_payload["artifactContents"]
            if content["artifact"]["kind"] == "research"
        )
    )
    finding = research["findings"][0]
    finding.update(
        {
            "status": "missing",
            "blocking": False,
            "note": "Optional market evidence remains missing.",
        }
    )
    research.update(
        {
            "readiness": "ready_with_gaps",
            "gaps": [finding["note"]],
            "conflicts": [],
        }
    )
    ResearchResultV2.model_validate(research)

    missing_summary = deepcopy(research)
    missing_summary["gaps"] = []
    with pytest.raises(ValidationError, match="gaps must exactly summarize"):
        ResearchResultV2.model_validate(missing_summary)

    finding.update(
        {
            "status": "conflicting",
            "blocking": True,
            "note": "Verified legal evidence conflicts.",
        }
    )
    research.update(
        {
            "readiness": "blocked",
            "gaps": [],
            "conflicts": [finding["note"]],
        }
    )
    ResearchResultV2.model_validate(research)

    missing_conflict_summary = deepcopy(research)
    missing_conflict_summary["conflicts"] = []
    with pytest.raises(ValidationError, match="conflicts must exactly summarize"):
        ResearchResultV2.model_validate(missing_conflict_summary)


def test_duplicate_claim_id_requires_identical_immutable_claim_content() -> None:
    acquired = _claim("Exact claim", "Exact claim")
    selected = {
        **acquired,
        "providerResponseHash": None,
        "segmentStart": None,
        "segmentEnd": None,
        "offsetUnit": None,
    }
    core = {
        "sourceTitle": "Exact source",
        "canonicalUrl": acquired["sourceUrls"][0],
        "sourceClasses": ["grounded_web"],
        "retrievalDate": "2026-08-28T12:00:00Z",
    }
    with pytest.raises(ValidationError, match="identical immutable content"):
        SelectedEvidenceArtifactV1.model_validate(
            {
                "schemaVersion": "axwise.evidence.v1",
                "requirementId": "claim-conflict",
                "applicability": "applicable",
                "claims": [selected, acquired],
                "conflicts": [],
                "sourceCatalogue": [
                    {
                        "sourceId": canonical_hash(core),
                        **core,
                        "supportedClaimIds": [acquired["claimId"]],
                    }
                ],
            }
        )


def test_artifact_hash_is_exact_content_envelope_not_payload_only() -> None:
    payload = {"markdown": "# Hé😀"}
    assert artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    ) == "6d43ff830cee40ccaee305ce2b5c8b227385f05823db241a0071f52accff9cf8"
    assert canonical_hash(payload) != artifact_content_hash(
        content_type="text/markdown", payload=payload, markdown="# Hé😀"
    )
