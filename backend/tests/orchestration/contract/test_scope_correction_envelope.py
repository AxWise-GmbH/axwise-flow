"""Production-safe semantic correction and continuation contracts."""

from __future__ import annotations

import asyncio
import json

import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from pydantic_ai.models.test import TestModel

from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    PlanningRequirementsV1,
)
from backend.api.routes import orchestration as orchestration_route
from backend.domain.orchestration.scope_models import (
    ScopeConsumerInputsV1,
    ScopeContinuationBindingV1,
    ScopeCorrectionRequestV1,
    ScopeSemanticAmbiguityV1,
    ScopeSemanticDeltaV1,
    ScopeSemanticFieldEditV1,
    ScopeSourceSpanV1,
)
from backend.services.orchestration.scope_contract_service import build_scope_packet
from backend.services.orchestration.scope_correction_service import (
    compile_scope_correction,
    PydanticAIScopeSemanticInterpreter,
    validate_continuation_request_authority,
    wrap_scope_interpretation,
)
from backend.tests.orchestration.contract.test_scope_research_contract import (
    _commercial_payload,
)
from backend.services.orqaly_research_bundle_service import (
    canonical_hash,
    canonical_json_string,
)


pytestmark = [pytest.mark.contract, pytest.mark.unit]


def _initial_request() -> DecisionCreateRequestV1:
    return DecisionCreateRequestV1.model_validate(_commercial_payload())


def _correction_request_for_packet(
    packet,
    text: str,
    *,
    source_correction_id: str | None = None,
) -> ScopeCorrectionRequestV1:
    payload = {
        "org_id": "orqaly-org-example",
        "user_id": "orqaly-user",
        "task_id": packet.scope_ref,
        "upstream_decision_id": "decision-parent",
        "source_correction_id": source_correction_id,
        "source_scope_packet": packet.model_dump(mode="json"),
        "source_scope_hash": packet.scope_hash,
        "source_scope_generation": packet.generation,
        "correction_text": text,
        "correction_hash": ScopeCorrectionRequestV1.canonical_correction_hash(text),
    }
    return ScopeCorrectionRequestV1.model_validate(payload)


def _correction_request(text: str) -> ScopeCorrectionRequestV1:
    return _correction_request_for_packet(build_scope_packet(_initial_request()), text)


def _edit(
    text: str,
    *,
    field: str,
    operation: str = "replace",
    text_value: str | None = None,
    item_values: tuple[str, ...] = (),
    document_intent: str | None = None,
    evidence_preference: str | None = None,
    work_goals: tuple[str, ...] = (),
    operation_intents: tuple[str, ...] = (),
    confidence: float = 0.99,
) -> ScopeSemanticFieldEditV1:
    return ScopeSemanticFieldEditV1(
        edit_id="edit-0000000000000001",
        field=field,
        operation=operation,
        text_value=text_value,
        item_values=item_values,
        document_intent=document_intent,
        evidence_preference=evidence_preference,
        work_goals=work_goals,
        operation_intents=operation_intents,
        source_span=ScopeSourceSpanV1(start=0, end=len(text), text=text),
        confidence=confidence,
    )


def _compile(
    request: ScopeCorrectionRequestV1,
    *edits: ScopeSemanticFieldEditV1,
    ambiguities: tuple[ScopeSemanticAmbiguityV1, ...] = (),
):
    delta = ScopeSemanticDeltaV1(edits=tuple(edits), ambiguities=ambiguities)
    interpretation = wrap_scope_interpretation(request, delta)
    return compile_scope_correction(
        request,
        interpretation,
        correction_id="scope-correction-" + "0" * 32,
        proposal_source=_initial_request(),
    )


def _test_continuation(
    packet,
    purpose: str,
    correction_id: str | None,
    *,
    payload=None,
):
    if payload is None:
        payload = (
            {"planning": {}, "catalogue": {}}
            if purpose == "planning"
            else {}
        )
    consumer = ScopeConsumerInputsV1(
        purpose=purpose,
        consumer_id=f"consumer-{purpose}",
        task_id=packet.scope_ref,
        scope_hash=packet.scope_hash,
        scope_generation=packet.generation,
        payload=payload,
        payload_hash=canonical_hash(payload),
    )
    payload = {
        "version": "axwise_scope_continuation_v1",
        "org_id": "orqaly-org-example",
        "user_id": "orqaly-user",
        "task_id": packet.scope_ref,
        "proposal_decision_id": "scope-proposal-" + "1" * 32,
        "proposal_hash": "2" * 64,
        "acceptance_id": "scope-acceptance-" + "3" * 32,
        "acceptance_hash": "4" * 64,
        "scope_hash": packet.scope_hash,
        "scope_generation": packet.generation,
        "correction_id": correction_id,
        "purpose": purpose,
        "consumer_inputs_hash": consumer.consumer_inputs_hash,
    }
    payload["binding_hash"] = ScopeContinuationBindingV1.canonical_hash_for(payload)
    return ScopeContinuationBindingV1.model_validate(payload), consumer


def test_correction_request_binds_exact_packet_hash_generation_and_text_hash():
    request = _correction_request("Use the exact title Estonia Launch Plan")

    with pytest.raises(ValidationError, match="correction_hash"):
        ScopeCorrectionRequestV1.model_validate(
            {**request.model_dump(mode="json"), "correction_hash": "0" * 64}
        )
    with pytest.raises(ValidationError, match="generation"):
        ScopeCorrectionRequestV1.model_validate(
            {
                **request.model_dump(mode="json"),
                "source_scope_generation": request.source_scope_generation + 1,
            }
        )


def test_pydantic_ai_native_structured_interpreter_uses_mock_model_only():
    text = "Set the title prefix to Estonia Cat Food Plan"
    request = _correction_request(text)
    output = {
        "edits": [
            {
                "edit_id": "edit-0000000000000001",
                "field": "deliverable_title_prefix",
                "operation": "replace",
                "text_value": "Estonia Cat Food Plan",
                "source_span": {"start": 0, "end": len(text), "text": text},
                "confidence": 0.99,
            }
        ],
        "ambiguities": [],
    }
    interpreter = PydanticAIScopeSemanticInterpreter(
        model=TestModel(
            custom_output_text=json.dumps(output),
            profile={"supports_json_schema_output": True},
        )
    )

    delta = asyncio.run(interpreter.interpret(request))

    assert delta.edits[0].field == "deliverable_title_prefix"
    assert delta.edits[0].source_span.text == text


def test_title_only_correction_preserves_all_semantic_and_authority_surfaces():
    text = "Set the title prefix to Estonia Cat Food Plan"
    request = _correction_request(text)
    result = _compile(
        request,
        _edit(
            text,
            field="deliverable_title_prefix",
            text_value="Estonia Cat Food Plan",
        ),
    )

    assert result.status == "compiled"
    packet = result.scope_packet
    assert packet is not None
    assert packet.generation == 1
    assert packet.source_scope_hash == request.source_scope_hash
    assert packet.correction_interpretation == result.interpretation
    assert packet.deliverable.title_prefix == "Estonia Cat Food Plan"
    assert packet.intent == request.source_scope_packet.intent
    assert packet.admission == request.source_scope_packet.admission
    assert packet.research_contract == request.source_scope_packet.research_contract
    assert packet.authority_snapshot == request.source_scope_packet.authority_snapshot
    assert result.scope_validation.scope_hash == packet.scope_hash
    assert result.scope_validation.valid is True
    assert result.scope_confirmation.scope_hash == packet.scope_hash
    assert result.scope_contract_binding.scope_hash == packet.scope_hash
    assert (
        result.scope_contract_binding.contract_hash
        == packet.research_contract.contract_hash
    )
    assert result.quality_contract == packet.quality_contract
    assert result.compiler_version == "scope-deterministic-compiler-v1.2.0"

    tampered = result.model_dump(mode="json")
    tampered["scope_validation"]["valid"] = False
    with pytest.raises(ValidationError, match="companions"):
        type(result).model_validate(tampered)


def test_explicit_country_replacement_changes_only_geography_dependencies():
    text = "Replace the market country Estonia with Latvia"
    request = _correction_request(text)
    result = _compile(
        request,
        _edit(text, field="geographies", item_values=("LV",)),
    )

    assert result.status == "compiled"
    packet = result.scope_packet
    assert packet is not None
    assert packet.admission.geographies == ["LV"]
    assert packet.research_contract.geographies == ("LV",)
    assert packet.research_contract.evidence == (
        request.source_scope_packet.research_contract.evidence
    )
    assert packet.intent == request.source_scope_packet.intent
    assert packet.authority_snapshot == request.source_scope_packet.authority_snapshot


@pytest.mark.parametrize(
    ("text", "code"),
    [
        ("Replace Georgia O’Keeffe with another artist", "GE"),
        ("Replace Jordan Peterson with another speaker", "JO"),
        ("Replace Chad Smith with another drummer", "TD"),
        ("Replace Georgia Tech with another university", "GE"),
        ("Replace Estonia's artist profile of Georgia O'Keeffe", "GE"),
    ],
)
def test_person_and_organization_country_names_fail_closed(text: str, code: str):
    request = _correction_request(text)
    result = _compile(
        request,
        _edit(text, field="geographies", item_values=(code,)),
    )

    assert result.status == "needs_material_clarification"
    assert result.scope_packet is None
    assert result.clarification.reason_code == "unsupported"
    assert result.clarification.fields == ("geographies",)


def test_ambiguity_and_low_confidence_each_produce_exactly_one_material_question():
    text = "Make it more local"
    request = _correction_request(text)
    span = ScopeSourceSpanV1(start=0, end=len(text), text=text)
    ambiguity = ScopeSemanticAmbiguityV1(
        ambiguity_id="amb-0000000000000001",
        field="geographies",
        reason="Local could mean a city, a country, or the existing market.",
        material_question="Which country or market should 'local' mean?",
        source_span=span,
    )
    ambiguous = _compile(request, ambiguities=(ambiguity,))
    assert ambiguous.status == "needs_material_clarification"
    assert (
        ambiguous.clarification.question
        == "Which country or market should 'local' mean?"
    )

    low = _compile(
        request,
        _edit(
            text,
            field="deliverable_title_prefix",
            text_value="more local",
            confidence=0.5,
        ),
    )
    assert low.status == "needs_material_clarification"
    assert low.clarification.reason_code == "low_confidence"


def test_out_of_contract_literals_fail_closed_without_silent_truncation():
    long_title = "T" * 256
    title_text = f"Set the title prefix to {long_title}"
    title_result = _compile(
        _correction_request(title_text),
        _edit(
            title_text,
            field="deliverable_title_prefix",
            text_value=long_title,
        ),
    )
    assert title_result.status == "needs_material_clarification"
    assert title_result.clarification.reason_code == "unsupported"
    assert title_result.clarification.fields == ("deliverable_title_prefix",)

    role_text = "Use executor role A"
    role_result = _compile(
        _correction_request(role_text),
        _edit(
            role_text,
            field="role_requirements",
            item_values=("A",),
        ),
    )
    assert role_result.status == "needs_material_clarification"
    assert role_result.clarification.reason_code == "unsupported"
    assert role_result.clarification.fields == ("role_requirements",)


def test_exact_veto_can_only_narrow_actions_and_tools():
    text = (
        "Please do not spend money for this launch. "
        "Please do not use tools for this."
    )
    request = _correction_request(text)
    # The model observes an unrelated non-goal. Literal vetoes remain compiler-owned.
    result = _compile(
        request,
        _edit(
            text,
            field="non_goals",
            operation="add",
            item_values=("Do not spend money",),
        ),
    )

    assert result.status == "compiled"
    packet = result.scope_packet
    assert packet is not None
    assert "spend_money" not in {
        item.action for item in packet.admission.requested_actions
    }
    assert packet.authority_snapshot.required_tools == ()
    assert set(request.source_scope_packet.authority_snapshot.required_tools).issubset(
        set(packet.authority_snapshot.denied_tools)
    )
    assert (
        packet.research_contract.evidence
        == request.source_scope_packet.research_contract.evidence
    )


def test_existing_only_evidence_fails_closed_until_execution_is_supported():
    text = "Use only existing evidence for now."
    result = _compile(
        _correction_request(text),
        _edit(
            text,
            field="non_goals",
            operation="add",
            item_values=("Use only existing evidence",),
        ),
    )

    assert result.status == "needs_material_clarification"
    assert result.clarification.reason_code == "unsupported"
    assert result.clarification.fields == ("evidence_preference",)


def test_operation_edit_recomputes_roles_and_fails_closed_at_role_cap():
    text = "Also send SMS"
    result = _compile(
        _correction_request(text),
        _edit(
            text,
            field="operation_intents",
            operation="add",
            operation_intents=("send_sms",),
        ),
    )

    assert result.status == "needs_material_clarification"
    assert result.clarification.reason_code == "unsupported"
    assert result.clarification.fields == ("role_requirements",)
    assert "8 executor roles" in result.clarification.question


def test_irreversible_operation_derives_approval_risk_and_role_authority():
    text = (
        "Use only the External Service Operations Specialist role and also send SMS"
    )
    operation_edit = _edit(
        text,
        field="operation_intents",
        operation="add",
        operation_intents=("send_sms",),
    )
    role_edit = _edit(
        text,
        field="role_requirements",
        item_values=("External Service Operations Specialist",),
    ).model_copy(update={"edit_id": "edit-0000000000000002"})

    result = _compile(_correction_request(text), operation_edit, role_edit)

    assert result.status == "compiled"
    packet = result.scope_packet
    action = next(
        item for item in packet.admission.requested_actions if item.action == "send_sms"
    )
    assert action.mode == "execute"
    assert action.side_effect == "irreversible"
    assert action.requires_authorization is True
    assert "send_sms" in packet.authority_snapshot.approval_actions
    assert packet.authority_snapshot.task_risk_level == "high"
    assert packet.authority_snapshot.task_reversibility == "irreversible"
    assert "external_service_operation" in packet.research_contract.work_types
    assert {
        role.role for role in packet.research_contract.executor_role_slots
    } == {"External Service Operations Specialist"}


def test_live_planning_only_no_outreach_correction_preserves_full_scope():
    text = (
        "Keep the complete requested deliverable and all research requirements. "
        "Campaign-related work is planning and analysis only. "
        "Do not perform outreach or contact any person, customer, supplier, "
        "partner, or other external party."
    )
    semantic_span = "Campaign-related work is planning and analysis only."
    start = text.index(semantic_span)
    output = {
        "edits": [
            {
                "edit_id": "edit-0000000000000001",
                "field": "work_goals",
                "operation": "replace",
                "work_goals": ["investigate", "plan"],
                "source_span": {
                    "start": start,
                    "end": start + len(semantic_span),
                    "text": semantic_span,
                },
                "confidence": 0.99,
            }
        ],
        "ambiguities": [],
    }
    request = _correction_request(text)
    interpreter = PydanticAIScopeSemanticInterpreter(
        model=TestModel(
            custom_output_text=json.dumps(output),
            profile={"supports_json_schema_output": True},
        )
    )

    delta = asyncio.run(interpreter.interpret(request))
    result = compile_scope_correction(
        request,
        wrap_scope_interpretation(request, delta),
        correction_id="scope-correction-" + "0" * 32,
        proposal_source=_initial_request(),
    )

    assert result.status == "compiled"
    packet = result.scope_packet
    source = request.source_scope_packet
    assert packet.deliverable == source.deliverable
    assert packet.research_contract.evidence == source.research_contract.evidence
    assert set(packet.research_contract.evidence.required_outputs) == set(
        source.research_contract.evidence.required_outputs
    )
    assert set(packet.research_contract.work_types) == {
        "research_analysis",
        "strategy_planning",
    }
    assert "outreach_campaign" not in packet.research_contract.work_types
    assert "contact_external_party" not in {
        action.action for action in packet.admission.requested_actions
    }
    assert {item.text for item in source.ledger.requirements} == {
        item.text for item in packet.ledger.requirements
    }
    assert any(
        "do not perform outreach or contact any person" in item.text
        for item in packet.ledger.constraints
    )


def test_scope_and_delta_hashes_use_ecmascript_number_canonicalization():
    text = "Set the title prefix to Estonia Cat Food Plan"
    request = _correction_request(text)
    edit = _edit(
        text,
        field="deliverable_title_prefix",
        text_value="Estonia Cat Food Plan",
        confidence=1.0,
    )
    result = _compile(request, edit)
    packet_payload = result.scope_packet.model_dump(
        mode="json", exclude={"scope_hash"}
    )
    delta_payload = result.interpretation.delta.model_dump(mode="json")

    assert result.scope_packet.scope_hash == canonical_hash(packet_payload)
    assert result.interpretation.delta_hash == canonical_hash(delta_payload)
    assert '"confidence":1' in canonical_json_string(delta_payload)
    assert '"confidence":1.0' not in canonical_json_string(delta_payload)


def test_multi_generation_objective_rebuilds_generated_ledger_entries():
    first_text = "Replace the objective with Plan dog-food distribution in Estonia"
    first_request = _correction_request(first_text)
    first = _compile(
        first_request,
        _edit(
            first_text,
            field="objective",
            text_value="Plan dog-food distribution in Estonia",
        ),
    )
    second_text = (
        "Replace the objective with Plan rabbit-food distribution in Estonia"
    )
    second_request = _correction_request_for_packet(
        first.scope_packet,
        second_text,
        source_correction_id="scope-correction-" + "d" * 32,
    )
    second = _compile(
        second_request,
        _edit(
            second_text,
            field="objective",
            text_value="Plan rabbit-food distribution in Estonia",
        ),
    )

    requirement_texts = {item.text for item in second.scope_packet.ledger.requirements}
    assert "Plan rabbit-food distribution in Estonia" in requirement_texts
    assert "Plan dog-food distribution in Estonia" not in requirement_texts
    assert first_request.source_scope_packet.intent.objective not in requirement_texts
    requirement_ids = {
        item.requirement_id for item in second.scope_packet.ledger.requirements
    }
    assert {
        requirement_id
        for item in second.scope_packet.ledger.acceptance
        for requirement_id in item.supports
    } == requirement_ids


def test_outcome_replacement_updates_generated_success_criterion():
    text = "Replace the outcome with Higher dog-food trial in Estonia"
    request = _correction_request(text)
    result = _compile(
        request,
        _edit(
            text,
            field="desired_outcome",
            text_value="Higher dog-food trial in Estonia",
        ),
    )

    assert result.status == "compiled"
    assert result.scope_packet.admission.success_criteria == [
        "Higher dog-food trial in Estonia"
    ]
    assert request.source_scope_packet.intent.desired_outcome not in (
        result.scope_packet.admission.success_criteria
    )


def test_geography_change_with_existing_ledger_knowledge_fails_closed():
    payload = _commercial_payload()
    payload["scope_state"] = {
        "facts": [
            {
                "claim": "Estonia distributors require local evidence",
                "verification": "unverified",
                "source_refs": ["research.market.estonia"],
            }
        ]
    }
    packet = build_scope_packet(DecisionCreateRequestV1.model_validate(payload))
    text = "Replace the market country Estonia with Latvia"
    result = _compile(
        _correction_request_for_packet(packet, text),
        _edit(text, field="geographies", item_values=("LV",)),
    )

    assert result.status == "needs_material_clarification"
    assert result.clarification.reason_code == "dependency_invalidated"
    assert result.clarification.fields == ("geographies",)


def test_legacy_natural_language_action_is_canonicalized_before_veto():
    payload = _commercial_payload()
    payload["task"]["requested_actions"] = ["Contact suppliers"]
    packet = build_scope_packet(DecisionCreateRequestV1.model_validate(payload))
    text = "Do not contact suppliers"
    result = _compile(
        _correction_request_for_packet(packet, text),
        _edit(
            text,
            field="non_goals",
            operation="add",
            item_values=("Do not contact suppliers",),
        ),
    )

    assert result.status == "compiled"
    assert not result.scope_packet.admission.requested_actions


def test_custom_document_intent_with_research_prd_clarifies_not_raises():
    text = "Replace the document intent with custom"
    result = _compile(
        _correction_request(text),
        _edit(text, field="document_intent", document_intent="custom"),
    )

    assert result.status == "needs_material_clarification"
    assert result.clarification.reason_code == "dependency_invalidated"
    assert "document_intent" in result.clarification.fields


def test_none_to_synthetic_evidence_repairs_role_output_dependency():
    first_text = "Use no research evidence"
    first = _compile(
        _correction_request(first_text),
        _edit(
            first_text,
            field="evidence_preference",
            evidence_preference="none",
        ),
    )
    second_text = "Use synthetic research evidence"
    second_request = _correction_request_for_packet(
        first.scope_packet,
        second_text,
        source_correction_id="scope-correction-" + "e" * 32,
    )
    second = _compile(
        second_request,
        _edit(
            second_text,
            field="evidence_preference",
            evidence_preference="synthetic",
        ),
    )

    assert second.status == "compiled"
    assert second.scope_packet.research_contract.evidence.mode == "synthetic"
    assert "persona_resolution" in (
        second.scope_packet.research_contract.evidence.required_outputs
    )


def test_non_prd_document_intent_replaces_stale_deliverable_type():
    first_text = "Use no research evidence"
    first = _compile(
        _correction_request(first_text),
        _edit(
            first_text,
            field="evidence_preference",
            evidence_preference="none",
        ),
    )
    second_text = "Replace the document intent with product strategy"
    second = _compile(
        _correction_request_for_packet(
            first.scope_packet,
            second_text,
            source_correction_id="scope-correction-" + "f" * 32,
        ),
        _edit(
            second_text,
            field="document_intent",
            document_intent="product_strategy",
        ),
    )

    assert second.status == "compiled"
    assert second.scope_packet.deliverable.type == "product_strategy_deliverable"


def test_prior_sms_veto_blocks_later_action_until_explicitly_resolved():
    first_text = "Do not send SMS"
    first = _compile(
        _correction_request(first_text),
        _edit(
            first_text,
            field="non_goals",
            operation="add",
            item_values=("Do not send SMS",),
        ),
    )
    second_text = (
        "Now send SMS. Use only External Service Operations Specialist."
    )
    operation = _edit(
        second_text,
        field="operation_intents",
        operation="add",
        operation_intents=("send_sms",),
    )
    role = _edit(
        second_text,
        field="role_requirements",
        item_values=("External Service Operations Specialist",),
    ).model_copy(update={"edit_id": "edit-0000000000000002"})
    second = _compile(
        _correction_request_for_packet(
            first.scope_packet,
            second_text,
            source_correction_id="scope-correction-" + "1" * 32,
        ),
        operation,
        role,
    )

    assert second.status == "needs_material_clarification"
    assert second.clarification.reason_code == "dependency_invalidated"
    assert second.clarification.fields == ("operation_intents",)


def test_stored_delta_is_deterministic_and_tampering_changes_or_breaks_hashes():
    text = "Set the title prefix to Estonia Cat Food Plan"
    request = _correction_request(text)
    edit = _edit(
        text,
        field="deliverable_title_prefix",
        text_value="Estonia Cat Food Plan",
    )
    first = _compile(request, edit)
    second = _compile(request, edit)

    assert first == second
    assert first.scope_packet.scope_hash == second.scope_packet.scope_hash
    payload = first.interpretation.model_dump(mode="json")
    payload["delta"]["edits"][0]["confidence"] = 0.98
    with pytest.raises(ValidationError, match="delta_hash"):
        type(first.interpretation).model_validate(payload)


def test_continuation_binds_exact_accepted_hash_and_rejects_scope_expansion():
    text = "Set the title prefix to Estonia Cat Food Plan"
    correction = _correction_request(text)
    compiled = _compile(
        correction,
        _edit(
            text,
            field="deliverable_title_prefix",
            text_value="Estonia Cat Food Plan",
        ),
    )
    packet = compiled.scope_packet
    binding, _ = _test_continuation(
        packet, "planning", "scope-correction-" + "a" * 32
    )
    assert binding.scope_hash == packet.scope_hash
    assert binding.scope_generation == packet.generation
    expanded = packet.model_copy(
        update={
            "intent": packet.intent.model_copy(
                update={"objective": packet.intent.objective + " and deploy it"}
            )
        }
    )
    assert expanded.intent.objective != packet.intent.objective
    with pytest.raises(ValidationError, match="scope_hash"):
        type(packet).model_validate(expanded.model_dump(mode="json"))


def test_continuation_request_rejects_new_action_tool_and_unbound_plan_step():
    text = "Set the title prefix to Estonia Cat Food Plan"
    correction = _correction_request(text)
    packet = _compile(
        correction,
        _edit(
            text,
            field="deliverable_title_prefix",
            text_value="Estonia Cat Food Plan",
        ),
    ).scope_packet
    source = _initial_request()
    task = source.task.model_copy(
        update={
            "objective": packet.intent.objective,
            "desired_outcome": packet.intent.desired_outcome,
            "required_tools": list(packet.authority_snapshot.required_tools),
            "requested_actions": [
                action.action for action in packet.admission.requested_actions
            ],
            "required_capabilities": list(packet.admission.required_capabilities),
            "stakeholders": list(packet.intent.audiences),
            "constraints": list(packet.authority_snapshot.task_constraints),
        }
    )
    policy = source.policy_context.model_copy(
        update={
            "denied_tool_ids": list(packet.authority_snapshot.denied_tools),
            "human_approval_required_for": list(
                packet.authority_snapshot.approval_actions
            ),
            "guardrails": list(packet.authority_snapshot.guardrails),
        }
    )
    binding, consumer = _test_continuation(
        packet, "research", "scope-correction-" + "b" * 32
    )
    continued = source.model_copy(
        update={
            "upstream_decision_id": correction.upstream_decision_id,
            "task": task,
            "policy_context": policy,
            "research_policy": source.research_policy.model_copy(
                update={
                    "required_outputs": list(
                        packet.research_contract.evidence.required_outputs
                    )
                }
            ),
            "scope_packet": packet,
            "scope_continuation": binding,
            "scope_consumer_inputs": consumer,
        }
    )
    validate_continuation_request_authority(continued, packet)

    expanded_task = task.model_copy(
        update={
            "required_tools": [*task.required_tools, "shell_write"],
            "requested_actions": [*task.requested_actions, "deploy"],
        }
    )
    expanded = continued.model_copy(update={"task": expanded_task})
    with pytest.raises(Exception, match="task.required_tools"):
        validate_continuation_request_authority(expanded, packet)


def test_planning_continuation_rejects_hidden_actions_and_unsealed_outputs():
    text = "Set the title prefix to Estonia Cat Food Plan"
    correction = _correction_request(text)
    packet = _compile(
        correction,
        _edit(
            text,
            field="deliverable_title_prefix",
            text_value="Estonia Cat Food Plan",
        ),
    ).scope_packet
    source = _initial_request()
    authority = packet.authority_snapshot
    requirement = next(
        item for item in packet.ledger.requirements if item.text == packet.intent.objective
    )
    acceptance = next(
        item
        for item in packet.ledger.acceptance
        if requirement.requirement_id in item.supports
    )
    output_contract = {
        "scope_hash": packet.scope_hash,
        "requirement_ids": [requirement.requirement_id],
        "deliverable_type": packet.deliverable.type,
        "deliverable_count": packet.deliverable.count,
        "presentation": packet.deliverable.presentation,
        "required_sections": list(packet.deliverable.required_sections),
    }
    planning = PlanningRequirementsV1.model_validate(
        {
            "pattern": "single",
            "steps": [
                {
                    "step_id": "step-scope-bound",
                    "title": "Produce the accepted deliverable",
                    "objective": requirement.text,
                    "input_contract": {
                        "scope_hash": packet.scope_hash,
                        "requirement_ids": [requirement.requirement_id],
                    },
                    "output_contract": output_contract,
                    "completion_criteria": [getattr(acceptance, "then")[0]],
                }
            ],
        }
    )
    binding, consumer = _test_continuation(
        packet,
        "planning",
        "scope-correction-" + "c" * 32,
        payload={
            "planning": planning.model_dump(mode="json"),
            "catalogue": {},
        },
    )
    task = source.task.model_copy(
        update={
            "objective": packet.intent.objective,
            "desired_outcome": packet.intent.desired_outcome,
            "required_tools": list(authority.required_tools),
            "requested_actions": [
                action.action for action in packet.admission.requested_actions
            ],
            "required_capabilities": list(packet.admission.required_capabilities),
            "stakeholders": list(packet.intent.audiences),
            "constraints": list(authority.task_constraints),
        }
    )
    policy = source.policy_context.model_copy(
        update={
            "denied_tool_ids": list(authority.denied_tools),
            "human_approval_required_for": list(authority.approval_actions),
            "guardrails": list(authority.guardrails),
        }
    )
    continued = source.model_copy(
        update={
            "upstream_decision_id": correction.upstream_decision_id,
            "task": task,
            "policy_context": policy,
            "research_policy": source.research_policy.model_copy(
                update={
                    "required": False,
                    "grounding_required": False,
                    "minimum_mode": "instant",
                    "required_outputs": list(
                        packet.research_contract.evidence.required_outputs
                    )
                }
            ),
            "planning": planning,
            "scope_packet": packet,
            "scope_continuation": binding,
            "scope_consumer_inputs": consumer,
        }
    )

    validate_continuation_request_authority(continued, packet)

    hidden_step = planning.steps[0].model_copy(update={"title": "Deploy production"})
    hidden = continued.model_copy(
        update={"planning": planning.model_copy(update={"steps": [hidden_step]})}
    )
    with pytest.raises(Exception, match="undeclared_actions"):
        validate_continuation_request_authority(hidden, packet)

    unsealed_step = planning.steps[0].model_copy(
        update={"output_contract": {"artifact": "anything"}}
    )
    unsealed = continued.model_copy(
        update={"planning": planning.model_copy(update={"steps": [unsealed_step]})}
    )
    with pytest.raises(Exception, match="output_contract"):
        validate_continuation_request_authority(unsealed, packet)

    wrong_purpose = continued.model_copy(
        update={
            "scope_continuation": binding.model_copy(update={"purpose": "assignment"})
        }
    )
    with pytest.raises(Exception, match="scope_continuation.purpose"):
        validate_continuation_request_authority(wrong_purpose, packet)


def test_continuation_preserves_denials_and_resource_caps():
    source = _initial_request()
    restricted = source.model_copy(
        update={
            "task": source.task.model_copy(
                update={"constraints": ["Never publish without review"]}
            ),
            "policy_context": source.policy_context.model_copy(
                update={
                    "denied_agent_ids": ["agent-blocked"],
                    "maximum_risk_without_human": "low",
                }
            ),
            "budget": source.budget.model_copy(
                update={"maximum_cost": 100.0, "maximum_latency_ms": 60_000}
            ),
            "research_policy": source.research_policy.model_copy(
                update={
                    "allow_hybrid_research": False,
                    "fail_closed": True,
                    "allowed_source_types": ["provided_document"],
                    "maximum_research_cost": 25.0,
                    "maximum_research_latency_ms": 30_000,
                    "maximum_research_iterations": 1,
                    "maximum_evidence_items": 10,
                    "minimum_evidence_sufficiency": 0.75,
                    "minimum_value_of_information": 0.45,
                    "minimum_evidence_quality": 0.65,
                }
            ),
        }
    )
    packet = build_scope_packet(restricted)
    binding, consumer = _test_continuation(packet, "research", None)
    restricted = restricted.model_copy(
        update={
            "upstream_decision_id": "decision-parent",
            "scope_packet": packet,
            "scope_continuation": binding,
            "scope_consumer_inputs": consumer,
        }
    )
    validate_continuation_request_authority(restricted, packet)

    expanded = restricted.model_copy(
        update={
            "task": restricted.task.model_copy(update={"constraints": []}),
            "policy_context": restricted.policy_context.model_copy(
                update={
                    "denied_agent_ids": [],
                    "maximum_risk_without_human": "critical",
                }
            ),
            "budget": restricted.budget.model_copy(
                update={"maximum_cost": None, "maximum_latency_ms": None}
            ),
            "research_policy": restricted.research_policy.model_copy(
                update={
                    "allow_hybrid_research": True,
                    "fail_closed": False,
                    "allowed_source_types": None,
                    "maximum_research_cost": None,
                    "maximum_research_latency_ms": None,
                    "maximum_research_iterations": 2,
                    "maximum_evidence_items": 20,
                    "minimum_evidence_sufficiency": 0.5,
                    "minimum_value_of_information": 0.2,
                    "minimum_evidence_quality": 0.4,
                }
            ),
        }
    )
    with pytest.raises(Exception, match="policy.denied_agent_ids") as exc_info:
        validate_continuation_request_authority(expanded, packet)
    assert "task.constraints" in str(exc_info.value)
    assert "budget.maximum_cost" in str(exc_info.value)
    assert "research_policy.maximum_research_iterations" in str(exc_info.value)


def test_openapi_publishes_unified_proposal_acceptance_and_consumer_boundaries():
    app = FastAPI()
    app.include_router(orchestration_route.router)
    schema = app.openapi()
    base = "/api/orqaly-axwise/v1/orchestration"

    assert f"{base}/decisions/{{decision_id}}/scope/corrections" not in schema["paths"]
    assert (
        f"{base}/scope/proposals/{{proposal_decision_id}}/corrections"
        in schema["paths"]
    )
    assert (
        f"{base}/scope/corrections/{{correction_id}}/clarifications/"
        "{clarification_id}/answers"
        in schema["paths"]
    )
    assert f"{base}/scope/corrections/{{correction_id}}/accept" not in schema["paths"]
    assert f"{base}/scope/proposals/{{proposal_decision_id}}/accept" in schema["paths"]
    assert (
        f"{base}/scope/proposals/{{proposal_decision_id}}/continuations"
        in schema["paths"]
    )
    assert (
        f"{base}/scope/proposals/{{proposal_decision_id}}/consumers"
        in schema["paths"]
    )
    decision_properties = schema["components"]["schemas"][
        "DecisionCreateRequestV1-Input"
    ]["properties"]
    assert "scope_continuation" in decision_properties
    assert "scope_proposal_acceptance" in decision_properties
    assert "scope_consumer_inputs" in decision_properties
    correction_schema = schema["components"]["schemas"][
        "ScopeProposalCorrectionRequestV1"
    ]
    assert correction_schema["additionalProperties"] is False
    assert {
        "proposal_decision_id",
        "proposal_hash",
        "scope_hash",
        "scope_generation",
        "correction_hash",
    }.issubset(correction_schema["required"])
    assert "source_scope_packet" not in correction_schema["properties"]
    poll_schema = schema["components"]["schemas"]["ScopeCorrectionPollV1"]
    assert "request" not in poll_schema["properties"]
