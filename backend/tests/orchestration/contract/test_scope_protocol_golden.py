"""Golden cross-runtime scope protocol fixtures and drift fingerprint."""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.domain.orchestration.scope_models import (
    ScopeAssignmentDecisionProjectionV1,
    ScopeContinuationBindingV1,
    ScopeContinuationRequestV1,
    ScopeCorrectionPollV1,
    ScopeMaterialClarificationV1,
    ScopePlanningDecisionProjectionV1,
    ScopeProposalAcceptanceV1,
    ScopeProposalBindingV1,
    ScopeResearchCompletionRefV1,
)
from backend.domain.orchestration.scope_protocol import (
    SCOPE_PROTOCOL_GOLDEN_VERSION,
    build_scope_protocol_golden_bundle,
)
from backend.services.orqaly_research_bundle_service import canonical_hash


pytestmark = [pytest.mark.contract, pytest.mark.unit]


FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "scope_protocol_v1_golden.json"
)


def _stored() -> dict:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def _set_pointer(value: dict, pointer: str, replacement) -> None:
    parts = [part.replace("~1", "/").replace("~0", "~") for part in pointer.split("/")[1:]]
    cursor = value
    for part in parts[:-1]:
        cursor = cursor[int(part)] if isinstance(cursor, list) else cursor[part]
    final = parts[-1]
    if isinstance(cursor, list):
        cursor[int(final)] = replacement
    else:
        cursor[final] = replacement


def test_checked_in_protocol_fixture_matches_canonical_generator_byte_for_byte():
    stored = _stored()
    generated = build_scope_protocol_golden_bundle()

    assert stored == generated
    assert stored["version"] == SCOPE_PROTOCOL_GOLDEN_VERSION
    assert stored["fixture_fingerprint"] == canonical_hash(stored["fixtures"])
    assert stored["protocol_fingerprint"] == canonical_hash(
        {
            "version": stored["version"],
            "schema_fingerprint": stored["schema_fingerprint"],
            "fixture_fingerprint": stored["fixture_fingerprint"],
        }
    )


def test_every_golden_contract_parses_and_reproduces_its_exact_hash():
    fixtures = _stored()["fixtures"]
    initial = ScopeProposalBindingV1.model_validate(fixtures["initial_proposal"])
    corrected = ScopeProposalBindingV1.model_validate(fixtures["corrected_proposal"])
    research = ScopeProposalBindingV1.model_validate(fixtures["research_proposal"])
    initial_acceptance = ScopeProposalAcceptanceV1.model_validate(
        fixtures["initial_acceptance"]
    )
    corrected_acceptance = ScopeProposalAcceptanceV1.model_validate(
        fixtures["corrected_acceptance"]
    )
    research_acceptance = ScopeProposalAcceptanceV1.model_validate(
        fixtures["research_acceptance"]
    )
    completion = ScopeResearchCompletionRefV1.model_validate(
        fixtures["research_completion"]
    )
    clarification = ScopeMaterialClarificationV1.model_validate(
        fixtures["clarification"]
    )

    assert initial.scope_generation == 0 and initial.correction_id is None
    assert corrected.scope_generation == 1 and corrected.correction_id is not None
    assert research.disclosure.research_required is True
    assert initial_acceptance.proposal_hash == initial.proposal_hash
    assert corrected_acceptance.proposal_hash == corrected.proposal_hash
    assert research_acceptance.proposal_hash == research.proposal_hash
    assert completion.proposal_hash == research.proposal_hash
    assert completion.acceptance_hash == research_acceptance.acceptance_hash
    assert clarification.source_scope_hash == initial.scope_hash
    for poll in fixtures["poll_states"].values():
        ScopeCorrectionPollV1.model_validate(poll)
    for purpose, fixture in fixtures["continuations"].items():
        request = ScopeContinuationRequestV1.model_validate(fixture["request"])
        binding = ScopeContinuationBindingV1.model_validate(fixture["binding"])
        assert request.consumer_inputs.version == "orqaly_scope_consumer_inputs_v1"
        assert request.consumer_inputs.purpose == binding.purpose == purpose
        assert (
            request.consumer_inputs.consumer_inputs_hash
            == fixture["consumer_inputs_hash"]
            == binding.consumer_inputs_hash
        )
        assert fixture["binding_hash"] == binding.binding_hash
    for fixture in fixtures["staged_continuations"].values():
        request = ScopeContinuationRequestV1.model_validate(fixture["request"])
        binding = ScopeContinuationBindingV1.model_validate(fixture["binding"])
        assert request.consumer_inputs.consumer_inputs_hash == (
            fixture["consumer_inputs_hash"]
        )
        assert binding.consumer_inputs_hash == fixture["consumer_inputs_hash"]
        assert binding.binding_hash == fixture["binding_hash"]
    planning_projection = ScopePlanningDecisionProjectionV1.model_validate(
        fixtures["decision_projections"]["planning"]
    )
    assignment_projection = ScopeAssignmentDecisionProjectionV1.model_validate(
        fixtures["decision_projections"]["assignment"]
    )
    assert planning_projection.projection_hash
    assert assignment_projection.projection_hash


def test_golden_staged_research_and_assignment_authority_is_exact():
    fixtures = _stored()["fixtures"]
    completion = fixtures["research_completion"]
    planning = fixtures["staged_continuations"]["research_to_planning"][
        "request"
    ]["consumer_inputs"]["payload"]
    assignment = fixtures["staged_continuations"][
        "research_planning_to_assignment"
    ]["request"]["consumer_inputs"]["payload"]

    assert planning["research_completion_ref"] == completion
    assert set(assignment) == {
        "authority_kind",
        "catalogue",
        "planning_projection_ref",
    }
    assert assignment["authority_kind"] == "planning_projection"
    assert set(assignment["planning_projection_ref"]) == {
        "version",
        "planning_decision_id",
        "planning_continuation_binding_hash",
        "planning_consumer_inputs_hash",
        "planning_projection_hash",
    }


def test_golden_synthesis_and_execution_surfaces_are_exact_and_content_free():
    continuations = _stored()["fixtures"]["continuations"]
    synthesis = continuations["synthesis"]["request"]["consumer_inputs"]["payload"]
    execution = continuations["execution"]["request"]["consumer_inputs"]["payload"]

    assert set(synthesis) == {"artifact_refs", "output_contract"}
    assert set(synthesis["artifact_refs"][0]) == {"reference_id", "content_hash"}
    assert set(execution) == {
        "authority_kind",
        "planning_projection_ref",
        "action_inputs",
    }
    assert execution["authority_kind"] == "planning_projection"
    assert execution["planning_projection_ref"] == continuations["assignment"][
        "request"
    ]["consumer_inputs"]["payload"]["planning_projection_ref"]
    assert set(execution["action_inputs"][0]) == {
        "action_id",
        "plan_node_id",
        "task_id",
        "job_id",
        "agent_id",
        "team_id",
        "concilium_id",
        "workflow_id",
        "workflow_execution_id",
        "input_refs",
        "tool_grant_ids",
        "tool_action_grants",
    }
    assert execution["action_inputs"][0]["tool_action_grants"] == [
        {"tool_id": "tool-sms", "allowed_actions": ["send_sms"]}
    ]
    serialized = json.dumps({"synthesis": synthesis, "execution": execution})
    assert "prompt" not in serialized.casefold()
    assert "instruction" not in serialized.casefold()


@pytest.mark.parametrize(
    "json_pointer",
    [
        "/consumer_inputs/payload/authority_kind",
        "/consumer_inputs/payload/planning_projection_ref",
        "/consumer_inputs/payload/action_inputs/0/plan_node_id",
        "/consumer_inputs/payload/action_inputs/0/tool_action_grants",
    ],
)
def test_execution_projection_authority_fields_are_required(json_pointer):
    request = deepcopy(
        _stored()["fixtures"]["continuations"]["execution"]["request"]
    )
    parts = json_pointer.split("/")[1:]
    cursor = request
    for part in parts[:-1]:
        cursor = cursor[int(part)] if isinstance(cursor, list) else cursor[part]
    cursor.pop(parts[-1])
    request["consumer_inputs"]["payload_hash"] = canonical_hash(
        request["consumer_inputs"]["payload"]
    )

    with pytest.raises(ValidationError, match="Field required"):
        ScopeContinuationRequestV1.model_validate(request)


@pytest.mark.parametrize(
    "field",
    ["action_id", "plan_node_id", "task_id", "job_id"],
)
def test_execution_manifest_identifiers_are_individually_unique(field):
    request = deepcopy(
        _stored()["fixtures"]["continuations"]["execution"]["request"]
    )
    first = request["consumer_inputs"]["payload"]["action_inputs"][0]
    second = deepcopy(first)
    second.update(
        {
            "action_id": "second-internal-work",
            "plan_node_id": "second-plan-node",
            "task_id": "second-team-task",
            "job_id": "second-job",
        }
    )
    second[field] = first[field]
    request["consumer_inputs"]["payload"]["action_inputs"].append(second)
    request["consumer_inputs"]["payload_hash"] = canonical_hash(
        request["consumer_inputs"]["payload"]
    )

    with pytest.raises(ValidationError, match=f"unique {field}"):
        ScopeContinuationRequestV1.model_validate(request)


def test_planning_projection_node_id_uses_cross_runtime_durable_id_shape():
    planning = deepcopy(_stored()["fixtures"]["decision_projections"]["planning"])
    planning["nodes"][0]["node_id"] = "node id with spaces"
    planning["projection_hash"] = ScopePlanningDecisionProjectionV1.canonical_hash_for(
        planning
    )

    with pytest.raises(ValidationError, match="string_pattern_mismatch"):
        ScopePlanningDecisionProjectionV1.model_validate(planning)


@pytest.mark.parametrize(
    ("tamper", "expected"),
    [
        ("assigned_agent_id", "string_pattern_mismatch"),
        ("reviewer_agent_id", "string_pattern_mismatch"),
        ("tool_id", "string_pattern_mismatch"),
        ("duplicate_tool_id", "projected plan node tool_ids must be unique"),
        (
            "grant_tool_not_on_node",
            "projected tool_action_grants must exactly cover node tool_ids",
        ),
        (
            "missing_tool_grant",
            "projected tool_action_grants must exactly cover node tool_ids",
        ),
        (
            "unsorted_grant_actions",
            "tool action grant allowed_actions must be canonical, sorted, and unique",
        ),
        (
            "unicode_grant_action",
            "string_pattern_mismatch",
        ),
        ("dependency_id", "string_pattern_mismatch"),
        (
            "duplicate_dependency_id",
            "projected plan node dependencies must be unique",
        ),
        ("team_member_id", "string_pattern_mismatch"),
        ("duplicate_team_member_id", "projected team_member_ids must be unique"),
    ],
)
def test_rehashed_planning_projection_rejects_unrepresentable_agent_tool_refs(
    tamper,
    expected,
):
    planning = deepcopy(_stored()["fixtures"]["decision_projections"]["planning"])
    node = planning["nodes"][0]
    if tamper in {"assigned_agent_id", "reviewer_agent_id"}:
        node[tamper] = "agent with spaces"
    elif tamper == "tool_id":
        node["tool_ids"] = ["tool with spaces"]
    elif tamper == "duplicate_tool_id":
        node["tool_ids"] = ["tool-valid", "tool-valid"]
    elif tamper == "grant_tool_not_on_node":
        node["tool_action_grants"][0]["tool_id"] = "tool-other"
    elif tamper == "missing_tool_grant":
        node["tool_action_grants"] = []
    elif tamper == "unsorted_grant_actions":
        node["tool_action_grants"][0]["allowed_actions"] = [
            "send_sms",
            "create_draft",
        ]
    elif tamper == "unicode_grant_action":
        node["tool_action_grants"][0]["allowed_actions"] = ["saada_sõnum"]
    elif tamper == "dependency_id":
        node["dependencies"] = ["node with spaces"]
    elif tamper == "duplicate_dependency_id":
        node["dependencies"] = ["step-golden", "step-golden"]
    elif tamper == "team_member_id":
        planning["team_member_ids"] = ["agent with spaces"]
    else:
        planning["team_member_ids"] = [
            "agent-golden-writer",
            "agent-golden-writer",
        ]
    planning["projection_hash"] = ScopePlanningDecisionProjectionV1.canonical_hash_for(
        planning
    )

    with pytest.raises(ValidationError, match=expected):
        ScopePlanningDecisionProjectionV1.model_validate(planning)


@pytest.mark.parametrize(
    ("tamper", "expected"),
    [
        ("agent_id", "string_pattern_mismatch"),
        ("node_id", "string_pattern_mismatch"),
        ("tool_id", "string_pattern_mismatch"),
        ("duplicate_node_id", "assignment selection node_ids must be unique"),
        ("duplicate_tool_id", "assignment selection tool_ids must be unique"),
        (
            "grant_tool_not_selected",
            "assignment tool_action_grants must exactly cover selection tool_ids",
        ),
        (
            "missing_tool_grant",
            "assignment tool_action_grants must exactly cover selection tool_ids",
        ),
    ],
)
def test_rehashed_assignment_projection_rejects_unrepresentable_agent_tool_refs(
    tamper,
    expected,
):
    assignment = deepcopy(
        _stored()["fixtures"]["decision_projections"]["assignment"]
    )
    selection = assignment["selected_agents"][0]
    if tamper == "agent_id":
        selection["agent_id"] = "agent with spaces"
    elif tamper == "node_id":
        selection["node_ids"] = ["node with spaces"]
    elif tamper == "tool_id":
        selection["tool_ids"] = ["tool with spaces"]
    elif tamper == "duplicate_node_id":
        selection["node_ids"] = ["node-valid", "node-valid"]
    elif tamper == "grant_tool_not_selected":
        selection["tool_action_grants"][0]["tool_id"] = "tool-other"
    elif tamper == "missing_tool_grant":
        selection["tool_action_grants"] = []
    else:
        selection["tool_ids"] = ["tool-valid", "tool-valid"]
    assignment["projection_hash"] = (
        ScopeAssignmentDecisionProjectionV1.canonical_hash_for(assignment)
    )

    with pytest.raises(ValidationError, match=expected):
        ScopeAssignmentDecisionProjectionV1.model_validate(assignment)


def test_golden_decision_projections_are_bounded_and_purpose_typed():
    projections = _stored()["fixtures"]["decision_projections"]
    planning = projections["planning"]
    assignment = projections["assignment"]

    assert set(planning) == {
        "version",
        "purpose",
        "decision_id",
        "decision_status",
        "routing_mode",
        "executable",
        "validation_status",
        "validation_rejections",
        "advisory_only",
        "projection_hash",
        "nodes",
        "team_member_ids",
        "template_mode",
        "total_estimated_cost",
        "critical_path_latency_ms",
        "currency",
    }
    assert set(assignment) == {
        "version",
        "purpose",
        "decision_id",
        "decision_status",
        "routing_mode",
        "executable",
        "validation_status",
        "validation_rejections",
        "advisory_only",
        "projection_hash",
        "selected_agents",
    }
    serialized = json.dumps(projections).casefold()
    for forbidden in ("input_snapshot", "candidate_rankings", "score", "rationale"):
        assert forbidden not in serialized


@pytest.mark.parametrize(
    "case_name",
    ["execution_free_form_prompt", "execution_payload_hash_tamper"],
)
def test_schema_tamper_vectors_fail_exact_consumer_validation(case_name):
    bundle = _stored()
    case = next(item for item in bundle["tamper_cases"] if item["name"] == case_name)
    purpose = "execution"
    request = deepcopy(bundle["fixtures"]["continuations"][purpose]["request"])
    _set_pointer(
        request,
        case["mutation"]["json_pointer"],
        case["mutation"]["value"],
    )
    if case["rehash_payload"]:
        request["consumer_inputs"]["payload_hash"] = canonical_hash(
            request["consumer_inputs"]["payload"]
        )

    with pytest.raises(ValidationError, match=case["expected_error"]):
        ScopeContinuationRequestV1.model_validate(request)


def test_authority_tamper_vectors_are_covered_by_named_service_regressions():
    authority_cases = {
        item["name"]: item
        for item in _stored()["tamper_cases"]
        if item["expected_stage"] == "authority"
    }

    assert set(authority_cases) == {
        "execution_plan_node_drift",
        "synthesis_output_expansion",
    }
    assert all(item["rehash_payload"] for item in authority_cases.values())
