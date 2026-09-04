from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.domain.agentic import (
    ConnectionReferenceV1,
    DataEgressMode,
    DataEgressProfileV1,
    DescriptorExecutionLimitPolicyV1,
    DescriptorVersionRefV1,
    EffectExternality,
    EffectFlag,
    EffectProfileV1,
    EffectTargetV1,
    ExternalActionSpecV1,
    ExternalPreconditionV1,
    ExecutionDescriptorManifestV1,
    ExecutionDescriptorV1,
    ExecutionLimitsV1,
    ExecutionPlanNodeV1,
    ExecutionPlanV1,
    ExecutorBindingVersionRefV1,
    IdempotencyBindingV1,
    MutationKind,
    PersonaVersionRefV1,
    ProviderOperationVersionRefV1,
    ReconciliationPolicyV1,
    StepKind,
    build_execution_descriptor_manifest_v1,
    build_execution_plan_v1,
    canonical_json_sha256,
    execution_descriptor_content_hash,
    execution_descriptor_wire_document,
)
from backend.domain.orchestration.enums import DataClassification


pytestmark = [pytest.mark.contract, pytest.mark.unit]
NOW = datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc)
HASH_A = "a" * 64
HASH_B = "b" * 64
HASH_C = "c" * 64
GOLDEN_PLAN_HASH = "0d527095c77da21716d5e53aef264305c95fa3751885051b2d174094a795354c"
GOLDEN_DESCRIPTOR_HASH = (
    "53b2f258fe840fe83506ac3f488c50d1ce9f2fca097e86960f7acc423fb8b8b9"
)
GOLDEN_DESCRIPTOR_BYTES_HASH = (
    "7a273738fdf4ed33a82b9ddf626973009e96c842832882116452887de146f153"
)
GOLDEN_EXTERNAL_PLAN_HASH = (
    "1894dc3355a689b42567e777afcb3b558aaea005390c40b9352ae8f0e3e9e53e"
)
GOLDEN_EXTERNAL_PLAN_BYTES_HASH = (
    "ef85ca7a09a6edb04db75a161d7656204a8bb4339c2cab7bcd3359485d67b508"
)
GOLDEN_EXTERNAL_INPUT_HASH = (
    "8cfaaf2cd017d5a1851172705ed5622c8e1d52cfe172035bf9f1999290134363"
)
GOLDEN_PLAN_PATH = (
    Path(__file__).parents[1] / "fixtures" / "axwise_execution_plan_v1_golden.json"
)
GOLDEN_DESCRIPTOR_PATH = (
    Path(__file__).parents[1]
    / "fixtures"
    / "axwise_execution_descriptor_manifest_v1_golden.json"
)
GOLDEN_EXTERNAL_PLAN_PATH = (
    Path(__file__).parents[1]
    / "fixtures"
    / "axwise_external_action_plan_v1_golden.json"
)


def descriptor_ref(key: str = "agent_reason_v1") -> DescriptorVersionRefV1:
    return DescriptorVersionRefV1(
        descriptor_key=key,
        schema_version="1.0",
        content_hash=HASH_A,
    )


def binding_ref() -> ExecutorBindingVersionRefV1:
    return ExecutorBindingVersionRefV1(
        binding_key="bounded_agent_executor",
        binding_version="1.0",
        content_hash=HASH_B,
    )


def external_action(*, include_precondition: bool = True) -> ExternalActionSpecV1:
    return ExternalActionSpecV1(
        effect_id="88888888-8888-4888-8888-888888888888",
        provider_operation=ProviderOperationVersionRefV1(
            operation_key="records.update",
            operation_version="1.0",
            content_hash=HASH_A,
        ),
        connection=ConnectionReferenceV1(
            connection_reference="connection-1",
            provider_key="example_crm",
            credential_owner_principal_id="user-1",
            requested_scopes=("records.read", "records.write"),
        ),
        targets=(
            EffectTargetV1(
                target_type="business_record",
                target_reference="record-1",
            ),
        ),
        external_preconditions=(
            (
                ExternalPreconditionV1(
                    precondition_type="record_version",
                    target_reference="record-1",
                    expected_state_hash=HASH_B,
                )
            ),
        )
        if include_precondition
        else (),
        idempotency=IdempotencyBindingV1(
            scope="logical_effect",
            key="update-record-1-v1",
        ),
        reconciliation=ReconciliationPolicyV1(
            strategy="provider_idempotency",
        ),
    )


def test_reference_key_bounds_match_the_orqaly_wire_contract():
    with pytest.raises(ValidationError, match="at most 200 characters"):
        descriptor_ref("a" * 201)
    with pytest.raises(ValidationError, match="at most 200 characters"):
        ExecutorBindingVersionRefV1(
            binding_key="a" * 201,
            binding_version="1.0",
            content_hash=HASH_B,
        )


def test_effect_profile_rejects_read_mutation_and_noncanonical_flags():
    with pytest.raises(ValidationError, match="mutation requires write"):
        EffectProfileV1(
            externality=EffectExternality.READ,
            mutation=MutationKind.UPDATE,
        )
    with pytest.raises(ValidationError, match="sorted and unique"):
        EffectProfileV1(
            externality=EffectExternality.WRITE,
            flags=(EffectFlag.PUBLICATION, EffectFlag.COMMUNICATION),
        )


def test_external_egress_is_explicit_and_policy_bound():
    profile = DataEgressProfileV1(
        mode=DataEgressMode.POLICY_BOUND_EXTERNAL,
        destination_classes=("approved_model",),
        provider_classes=("no_training",),
        region_classes=("approved_region",),
        permitted_input_classifications=(DataClassification.INTERNAL,),
        permitted_output_classifications=(DataClassification.INTERNAL,),
        redaction_required=True,
        dlp_required=True,
        provider_retention_policy_required=True,
        provider_training_policy_required=True,
    )

    assert profile.mode is DataEgressMode.POLICY_BOUND_EXTERNAL
    with pytest.raises(ValidationError, match="deny-all"):
        DataEgressProfileV1(destination_classes=("external_api",))


def test_write_descriptor_requires_reconciliation_and_pins_bindings():
    raw = json.loads(GOLDEN_DESCRIPTOR_PATH.read_text(encoding="utf-8"))
    raw["reconciliationPolicy"] = None
    with pytest.raises(ValidationError, match="reconciliation policy"):
        ExecutionDescriptorManifestV1.model_validate(raw)


def test_descriptor_manifest_golden_is_byte_identical_and_hash_bound():
    fixture_bytes = GOLDEN_DESCRIPTOR_PATH.read_bytes()
    raw = json.loads(fixture_bytes)

    assert sha256(fixture_bytes).hexdigest() == GOLDEN_DESCRIPTOR_BYTES_HASH
    assert raw["reference"]["contentHash"] == GOLDEN_DESCRIPTOR_HASH
    assert execution_descriptor_content_hash(raw) == GOLDEN_DESCRIPTOR_HASH

    parsed = ExecutionDescriptorManifestV1.model_validate(raw)
    assert execution_descriptor_wire_document(parsed) == raw

    mixed_mapping = deepcopy(raw)
    mixed_mapping["reference"] = parsed.reference
    assert execution_descriptor_content_hash(mixed_mapping) == GOLDEN_DESCRIPTOR_HASH

    builder_input = deepcopy(raw)
    del builder_input["reference"]["contentHash"]
    built = build_execution_descriptor_manifest_v1(**builder_input)
    assert execution_descriptor_wire_document(built) == raw

    tampered = deepcopy(raw)
    tampered["defaultTimeoutSeconds"] = 30
    with pytest.raises(ValidationError, match="content_hash"):
        ExecutionDescriptorManifestV1.model_validate(tampered)


def test_external_action_plan_golden_is_hash_bound_and_lossless():
    fixture_bytes = GOLDEN_EXTERNAL_PLAN_PATH.read_bytes()
    raw = json.loads(fixture_bytes)
    parsed = ExecutionPlanV1.model_validate(raw)

    assert sha256(fixture_bytes).hexdigest() == GOLDEN_EXTERNAL_PLAN_BYTES_HASH
    assert parsed.content_hash == GOLDEN_EXTERNAL_PLAN_HASH
    assert parsed.nodes[0].canonical_input_hash == GOLDEN_EXTERNAL_INPUT_HASH
    assert parsed.nodes[0].external_action is not None
    assert parsed.nodes[0].external_action.provider_operation.operation_key == (
        "records.update"
    )
    assert parsed.nodes[0].external_action.connection.requested_scopes == (
        "records.read",
        "records.write",
    )
    assert parsed.model_dump(mode="json", exclude_none=True) == raw


def plan_node(
    node_id: str,
    *,
    dependencies: tuple[str, ...] = (),
    assigned_agent_id: str = "agent-a",
) -> ExecutionPlanNodeV1:
    return ExecutionPlanNodeV1(
        node_id=node_id,
        title=f"Run {node_id}",
        objective=f"Complete {node_id}",
        step_kind=StepKind.REASON,
        descriptor=descriptor_ref(),
        executor_binding=binding_ref(),
        assigned_agent_id=assigned_agent_id,
        persona_version=PersonaVersionRefV1(
            persona_id=f"{assigned_agent_id}-persona",
            persona_version="1",
            content_hash=HASH_C,
        ),
        limits=ExecutionLimitsV1(
            maximum_turns=4,
            maximum_tokens=8_000,
            maximum_tool_calls=2,
            maximum_runtime_seconds=120,
            maximum_attempts=1,
            maximum_cost_minor=0,
            currency="EUR",
        ),
        dependencies=dependencies,
        canonical_input_hash=HASH_B,
        expected_output_schema_hash=HASH_C,
    )


def plan(*nodes: ExecutionPlanNodeV1) -> ExecutionPlanV1:
    return build_execution_plan_v1(
        plan_id="plan-1",
        plan_version=1,
        owning_agent_id="agent-a",
        team_id="team-1",
        team_member_ids=("agent-a", "agent-b"),
        nodes=nodes,
        created_at=NOW,
    )


def test_execution_plan_accepts_disconnected_dag_and_orders_dependencies():
    result = plan(
        plan_node("node-c", dependencies=("node-b",)),
        plan_node("node-a"),
        plan_node("node-b", dependencies=("node-a",)),
        plan_node("node-independent"),
    )

    order = result.topological_order()
    assert order.index("node-a") < order.index("node-b") < order.index("node-c")
    assert set(order) == {"node-a", "node-b", "node-c", "node-independent"}


@pytest.mark.parametrize(
    ("nodes", "message"),
    [
        (
            (plan_node("node-a"), plan_node("node-a")),
            "unique node_id",
        ),
        (
            (plan_node("node-a", dependencies=("missing",)),),
            "unknown dependencies",
        ),
        (
            (
                plan_node("node-a", dependencies=("node-b",)),
                plan_node("node-b", dependencies=("node-a",)),
            ),
            "acyclic graph",
        ),
    ],
)
def test_execution_plan_rejects_malformed_graphs(nodes, message):
    with pytest.raises(ValidationError, match=message):
        plan(*nodes)


def test_plan_rejects_assignment_outside_declared_team():
    with pytest.raises(ValidationError, match="outside the plan team"):
        plan(plan_node("node-a", assigned_agent_id="agent-outsider"))


def test_solo_execution_is_an_explicit_one_member_team():
    result = build_execution_plan_v1(
        plan_id="solo-plan-1",
        plan_version=1,
        owning_agent_id="agent-a",
        team_id="solo-team-1",
        team_member_ids=("agent-a",),
        nodes=(plan_node("node-a"),),
        created_at=NOW,
    )

    assert result.team_id == "solo-team-1"
    assert result.team_member_ids == ("agent-a",)


def test_external_plan_node_carries_complete_provider_neutral_action_authority():
    node = ExecutionPlanNodeV1(
        node_id="update-record",
        title="Update one record",
        objective="Set the approved status on the exact record",
        step_kind=StepKind.CONNECTOR_WRITE,
        descriptor=descriptor_ref("record_update_v1"),
        executor_binding=binding_ref(),
        assigned_agent_id="agent-a",
        persona_version=PersonaVersionRefV1(
            persona_id="agent-a-persona",
            persona_version="1",
            content_hash=HASH_C,
        ),
        canonical_input_hash=HASH_B,
        expected_output_schema_hash=HASH_C,
        effect_profile=EffectProfileV1(
            externality=EffectExternality.WRITE,
            mutation=MutationKind.UPDATE,
        ),
        data_egress_profile=DataEgressProfileV1(),
        external_action=external_action(),
        limits=ExecutionLimitsV1(
            maximum_turns=1,
            maximum_tokens=1_000,
            maximum_tool_calls=1,
            maximum_runtime_seconds=30,
            maximum_attempts=1,
            maximum_cost_minor=0,
            currency="EUR",
        ),
    )

    assert str(node.external_action.effect_id) == (
        "88888888-8888-4888-8888-888888888888"
    )
    assert node.external_action.connection.provider_key == "example_crm"


def test_external_plan_node_fails_closed_without_action_or_update_precondition():
    base = {
        "node_id": "update-record",
        "title": "Update one record",
        "objective": "Set the approved status on the exact record",
        "step_kind": StepKind.CONNECTOR_WRITE,
        "descriptor": descriptor_ref("record_update_v1"),
        "executor_binding": binding_ref(),
        "assigned_agent_id": "agent-a",
        "persona_version": PersonaVersionRefV1(
            persona_id="agent-a-persona",
            persona_version="1",
            content_hash=HASH_C,
        ),
        "canonical_input_hash": HASH_B,
        "expected_output_schema_hash": HASH_C,
        "effect_profile": EffectProfileV1(
            externality=EffectExternality.WRITE,
            mutation=MutationKind.UPDATE,
        ),
        "limits": ExecutionLimitsV1(
            maximum_turns=1,
            maximum_tokens=1_000,
            maximum_tool_calls=1,
            maximum_runtime_seconds=30,
            maximum_attempts=1,
            maximum_cost_minor=0,
            currency="EUR",
        ),
    }
    with pytest.raises(ValidationError, match="complete external action"):
        ExecutionPlanNodeV1(**base)
    with pytest.raises(ValidationError, match="exact external precondition"):
        ExecutionPlanNodeV1(
            **base,
            external_action=external_action(include_precondition=False),
        )


def test_preview_execution_bounds_match_the_orqaly_wire_contract():
    plan_schema = ExecutionPlanV1.model_json_schema()["properties"]
    descriptor_schema = ExecutionDescriptorV1.model_json_schema()["properties"]
    descriptor_limits_schema = DescriptorExecutionLimitPolicyV1.model_json_schema()[
        "properties"
    ]
    limits_schema = ExecutionLimitsV1.model_json_schema()["properties"]

    assert plan_schema["team_member_ids"]["maxItems"] == 5
    assert plan_schema["team_member_ids"]["minItems"] == 1
    assert plan_schema["nodes"]["maxItems"] == 200
    assert limits_schema["maximum_attempts"]["maximum"] == 10
    assert limits_schema["maximum_runtime_seconds"]["maximum"] == 86_400
    assert descriptor_schema["maximum_attempts"]["maximum"] == 10
    assert descriptor_schema["default_timeout_seconds"]["maximum"] == 86_400
    assert descriptor_limits_schema["maximum_runtime_seconds"]["maximum"] == 86_400


def test_execution_plan_golden_wire_fixture_has_stable_rfc8785_hash():
    raw = json.loads(GOLDEN_PLAN_PATH.read_text(encoding="utf-8"))
    node = raw["nodes"][0]

    assert raw["content_hash"] == GOLDEN_PLAN_HASH
    assert raw["created_at"] == "2026-09-04T10:00:00Z"
    assert "reviewer_agent_id" not in node
    assert "deadline" not in node

    hash_payload = {key: value for key, value in raw.items() if key != "content_hash"}
    assert canonical_json_sha256(hash_payload) == GOLDEN_PLAN_HASH

    parsed = ExecutionPlanV1.model_validate(raw)
    assert parsed.content_hash == GOLDEN_PLAN_HASH
    assert parsed.model_dump(mode="json", exclude_none=True) == raw
