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
    assert set(execution) == {"action_inputs"}
    assert set(execution["action_inputs"][0]) == {
        "action_id",
        "task_id",
        "job_id",
        "agent_id",
        "team_id",
        "concilium_id",
        "workflow_id",
        "workflow_execution_id",
        "input_refs",
        "tool_grant_ids",
    }
    serialized = json.dumps({"synthesis": synthesis, "execution": execution})
    assert "prompt" not in serialized.casefold()
    assert "instruction" not in serialized.casefold()


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
        "execution_action_drift",
        "synthesis_output_expansion",
    }
    assert all(item["rehash_payload"] for item in authority_cases.values())
