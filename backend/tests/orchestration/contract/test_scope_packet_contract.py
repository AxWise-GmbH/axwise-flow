"""Canonical scope packet, quality gate, UX, and persistence contracts."""

from __future__ import annotations

import hashlib
from copy import deepcopy

import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes import orchestration as orchestration_route
from backend.database import Base
from backend.domain.orchestration.models import DecisionCreateRequestV1
from backend.domain.orchestration.scope_models import ScopePacketV1, ScopeStateV1
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
)
from backend.models import OrchestrationDecisionSnapshot, OrchestrationEvent, User
from backend.services.orchestration.decision_service import OrchestrationDecisionService
from backend.services.orchestration.scope_contract_service import (
    build_scope_confirmation,
    build_scope_packet,
    validate_scope_packet,
)
from backend.tests.orchestration.unit.test_uncertainty_router import _payload


pytestmark = pytest.mark.contract


def _request(scope_state: dict | None = None) -> DecisionCreateRequestV1:
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    if scope_state is not None:
        payload["scope_state"] = scope_state
    return DecisionCreateRequestV1.model_validate(payload)


def _domain_request(
    task: dict,
    admission: dict | None,
) -> DecisionCreateRequestV1:
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    payload["task"].update(task)
    if admission is not None:
        payload["scope_state"] = {"admission": admission}
    return DecisionCreateRequestV1.model_validate(payload)


def _verified_fact(claim: str = "The supplied workflow uses an approval gate") -> dict:
    excerpt = "The supplied workflow uses an approval gate before execution."
    return {
        "claim": claim,
        "verification": "verified",
        "source_refs": ["source:workflow:1"],
        "source_authority_ids": ["authority:owner-document:1"],
        "verbatim_excerpt": excerpt,
        "content_hash": hashlib.sha256(excerpt.encode("utf-8")).hexdigest(),
    }


def test_scope_packet_is_order_independent_traceable_and_runtime_truthful():
    state = {
        "requirements": [
            {"text": "Include a risk register", "source_refs": ["user:message:2"]},
            {"text": "Include an accessibility review", "source_refs": ["user:message:1"]},
        ],
        "facts": [_verified_fact()],
        "assumptions": [
            {
                "text": "The first rollout is preview-only",
                "owner_confirmed": True,
                "materiality": "non_material",
            }
        ],
        "constraints": [
            {"text": "Do not send external messages", "kind": "policy"},
            {"text": "Keep tenant data isolated", "kind": "security"},
        ],
        "deliverable": {
            "type": "software_product_prd",
            "required_sections": ["Risks", "Acceptance tests", "Architecture"],
        },
    }
    first = build_scope_packet(_request(state))
    reordered = deepcopy(state)
    for key in ("requirements", "constraints"):
        reordered[key].reverse()
    reordered["deliverable"]["required_sections"].reverse()
    second = build_scope_packet(_request(reordered))

    assert first == second
    assert first.scope_hash == second.scope_hash
    assert [item.requirement_id for item in first.ledger.requirements] == sorted(
        item.requirement_id for item in first.ledger.requirements
    )
    assert {
        requirement.requirement_id
        for requirement in first.ledger.requirements
    } == {
        requirement_id
        for criterion in first.ledger.acceptance
        for requirement_id in criterion.supports
    }
    assert first.runtime.model == "gemini-3.7-flash"
    assert first.runtime.reasoning_mode == "high"
    assert first.runtime.context_window == 1_048_576
    assert first.runtime.max_output_tokens == 65_536
    assert first.runtime.output_policy == "provider_maximum_no_workflow_cap"
    assert '"minimum_requirement_coverage":1' in first.model_dump_json()
    assert '"minimum_requirement_coverage":1.0' not in first.model_dump_json()
    assert first.ledger.assumptions[0].truth_status == "assumption"
    assert first.ledger.assumptions[0].owner_confirmed is True
    assert all(
        fact.claim != first.ledger.assumptions[0].text
        for fact in first.ledger.facts
    )


@pytest.mark.parametrize(
    ("task", "admission", "expected_work_type", "expected_geography"),
    [
        (
            {
                "domain": "software",
                "objective": "Design a customer approval workflow",
                "desired_outcome": "A testable software delivery specification",
                "required_capabilities": ["Software architecture"],
                "requested_actions": ["prepare_specification"],
            },
            {
                "work_types": ["software_development"],
                "success_criteria": ["Critical flows have acceptance tests"],
            },
            "software_development",
            None,
        ),
        (
            {
                "domain": "marketing",
                "objective": "Prepare a regional product awareness campaign",
                "desired_outcome": "A measurable campaign ready for review",
                "required_capabilities": ["Campaign strategy"],
                "requested_actions": ["prepare_campaign_assets"],
            },
            {
                "work_types": ["outreach_campaign", "content_asset_creation"],
                "geographies": [" Germany ", "germany"],
                "channels": ["LinkedIn", " Email ", "email"],
                "success_criteria": ["Assets map to an audience and KPI"],
            },
            "outreach_campaign",
            "Germany",
        ),
        (
            {
                "domain": "communications",
                "objective": "Send an SMS service notification",
                "desired_outcome": "The consented recipients receive one notification",
                "required_capabilities": ["SMS delivery"],
                "requested_actions": ["send_sms"],
            },
            {
                "work_types": ["external_service_operation"],
                "channels": ["SMS"],
                "requested_actions": [
                    {
                        "action": "send_sms",
                        "mode": "execute",
                        "side_effect": "irreversible",
                        "requires_authorization": True,
                    }
                ],
            },
            "external_service_operation",
            None,
        ),
        (
            {
                "domain": "food_distribution",
                "objective": "Plan distribution of cat food in Estonia",
                "desired_outcome": "A commercially viable Estonia distribution plan",
                "required_capabilities": ["Supply chain planning"],
                "requested_actions": ["prepare_distribution_plan"],
            },
            {
                "work_types": ["procurement_logistics", "strategy_planning"],
                "geographies": ["Estonia"],
                "channels": ["B2B distributors", "Retail"],
                "success_criteria": ["Economics and launch risks are explicit"],
            },
            "procurement_logistics",
            "Estonia",
        ),
    ],
)
def test_scope_admission_is_domain_neutral_and_canonical(
    task,
    admission,
    expected_work_type,
    expected_geography,
):
    packet = build_scope_packet(_domain_request(task, admission))

    assert packet.admission is not None
    assert expected_work_type in packet.admission.work_types
    assert task["desired_outcome"] in packet.admission.success_criteria
    assert task["required_capabilities"][0] in packet.admission.required_capabilities
    assert packet.admission.channels == sorted(
        set(packet.admission.channels), key=str.casefold
    )
    if expected_geography:
        assert expected_geography in packet.admission.geographies
    assert packet.intent.objective == task["objective"]
    assert packet.deliverable.type
    assert packet.ledger.requirements


@pytest.mark.parametrize("corrected_field", ["objective", "desired_outcome"])
@pytest.mark.parametrize("include_previous_admission", [False, True])
def test_scope_rebuild_honors_explicit_work_type_negation_and_correction(
    corrected_field,
    include_previous_admission,
):
    task = {
        "domain": "software",
        "objective": "Build a software application",
        "desired_outcome": "A deployable software product",
        "required_capabilities": ["Software architecture"],
        "requested_actions": ["prepare_specification"],
    }
    task[corrected_field] = "Not software—make this a campaign"
    admission = None
    if include_previous_admission:
        admission = {
            "work_types": ["software_development"],
            "success_criteria": ["The corrected scope is followed"],
        }

    packet = build_scope_packet(_domain_request(task, admission))

    assert packet.admission.work_types == ["outreach_campaign"]
    assert "software_development" not in packet.admission.work_types


def test_legacy_task_actions_are_safely_normalized_without_domain_specific_schema():
    request = _domain_request(
        {
            "domain": "communications",
            "objective": "Send an SMS service notification",
            "desired_outcome": "The consented recipients receive one notification",
            "required_capabilities": ["SMS delivery"],
            "requested_actions": ["send_sms"],
        },
        admission=None,
    )

    packet = build_scope_packet(request)
    action = packet.admission.requested_actions[0]
    confirmation = build_scope_confirmation(packet)
    validation = validate_scope_packet(packet)

    assert "external_service_operation" in packet.admission.work_types
    assert action.action == "send_sms"
    assert action.mode == "execute"
    assert action.side_effect == "irreversible"
    assert action.requires_authorization is True
    assert confirmation.authorizes_external_actions is False
    assert next(
        check
        for check in validation.checks
        if check.check_id == "action_authorization_boundary"
    ).passed


def test_non_software_prd_type_does_not_invent_software_work():
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    payload["task"].update(
        {
            "domain": "marketing",
            "objective": "Prepare a regional awareness campaign",
            "desired_outcome": "A measurable campaign ready for review",
            "required_capabilities": ["Campaign strategy", "Content creation"],
            "requested_actions": [],
        }
    )
    payload["scope_state"] = {
        "deliverable": {
            "type": "operational_process_prd",
            "presentation": "markdown_artifact",
        }
    }
    request = DecisionCreateRequestV1.model_validate(payload)

    packet = build_scope_packet(request)

    assert packet.deliverable.type == "operational_process_prd"
    assert "outreach_campaign" in packet.admission.work_types
    assert "software_development" not in packet.admission.work_types


def test_explicit_action_shape_overrides_equivalent_legacy_action_spelling():
    request = _domain_request(
        {
            "domain": "communications",
            "objective": "Prepare an SMS service notification",
            "desired_outcome": "One approved notification is ready to send",
            "requested_actions": ["send_sms"],
        },
        admission={
            "requested_actions": [
                {
                    "action": "send SMS",
                    "mode": "prepare",
                    "side_effect": "none",
                    "requires_authorization": False,
                }
            ]
        },
    )

    packet = build_scope_packet(request)

    assert len(packet.admission.requested_actions) == 1
    assert packet.admission.requested_actions[0].action == "send SMS"
    assert packet.admission.requested_actions[0].mode == "prepare"


@pytest.mark.parametrize(
    "action",
    [
        {
            "action": "send_sms",
            "mode": "execute",
            "side_effect": "none",
            "requires_authorization": False,
        },
        {
            "action": "schedule_campaign",
            "mode": "prepare",
            "side_effect": "reversible",
            "requires_authorization": False,
        },
    ],
)
def test_scope_admission_never_self_authorizes_execution_or_side_effects(action):
    with pytest.raises(ValidationError, match="require Orqaly authorization"):
        ScopeStateV1.model_validate(
            {"admission": {"requested_actions": [action]}}
        )


def test_admission_is_additive_to_v1_hash_and_legacy_packets_still_validate():
    current = build_scope_packet(_request())
    current_payload = current.model_dump(mode="json")
    assert current.admission is not None
    assert current.scope_hash == ScopePacketV1.canonical_hash_for(current_payload)

    changed = deepcopy(current_payload)
    changed["admission"]["channels"] = ["email"]
    assert ScopePacketV1.canonical_hash_for(changed) != current.scope_hash

    legacy = deepcopy(current_payload)
    legacy.pop("admission")
    legacy["scope_hash"] = ScopePacketV1.canonical_hash_for(legacy)
    restored = ScopePacketV1.model_validate(legacy)

    assert restored.admission is None
    assert "admission" not in restored.model_dump(mode="json")
    assert restored.scope_hash == legacy["scope_hash"]
    assert ScopePacketV1.canonical_hash_for(
        restored.model_dump(mode="json", exclude={"scope_hash"})
    ) == restored.scope_hash


def test_explicit_first_line_literal_overrides_descriptive_task_title():
    payload = deepcopy(_payload())
    payload["tenant"] = {
        "userId": "orqaly-user",
        "orgId": "orqaly-org-example",
    }
    payload["task"]["objective"] = (
        "Create the ScopeConfirm production PRD as one Markdown file"
    )
    payload["task"]["desired_outcome"] = (
        "Produce exactly one Markdown document, beginning exactly "
        "\u201c# PRD: ScopeConfirm\u201d."
    )

    packet = build_scope_packet(DecisionCreateRequestV1.model_validate(payload))

    assert packet.deliverable.title_prefix == "# PRD: ScopeConfirm"


def test_semantic_ids_use_cross_runtime_unicode_lowercasing():
    packet = build_scope_packet(
        _request(
            {
                "requirements": [
                    {
                        "text": "Straße für kleine Unternehmen",
                        "source_refs": ["user:message:1"],
                    }
                ]
            }
        )
    )
    requirement = next(
        item
        for item in packet.ledger.requirements
        if item.text == "Straße für kleine Unternehmen"
    )
    canonical = '{"text":"straße für kleine unternehmen"}'
    expected = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]

    assert requirement.requirement_id == f"req-{expected}"


def test_verified_fact_contract_and_fact_assumption_separation_fail_closed():
    with pytest.raises(ValidationError, match="verified facts require"):
        ScopeStateV1.model_validate(
            {
                "facts": [
                    {
                        "claim": "A claimed production baseline",
                        "verification": "verified",
                    }
                ]
            }
        )

    overlap = {
        "facts": [_verified_fact("Preview-only rollout")],
        "assumptions": [
            {
                "text": "  Preview-only   rollout ",
                "owner_confirmed": True,
            }
        ],
    }
    with pytest.raises(ValidationError, match="both a fact and an assumption"):
        build_scope_packet(_request(overlap))


def test_scope_confirmation_asks_one_question_only_for_a_material_blocker():
    blocked = build_scope_packet(
        _request(
            {
                "decisions": [
                    {
                        "question": "May customer data be sent to Gemini?",
                        "status": "open",
                        "materiality": "material",
                    },
                    {
                        "question": "Which heading style should be used?",
                        "status": "proposed",
                        "materiality": "non_material",
                        "proposal": "Use sentence case",
                    },
                ]
            }
        )
    )
    validation = validate_scope_packet(blocked)
    confirmation = build_scope_confirmation(blocked)

    assert blocked.document_status == "Draft"
    assert validation.valid is True
    assert validation.ready_for_synthesis is False
    assert validation.unresolved_decision_count == 2
    assert confirmation.status == "needs_material_input"
    assert confirmation.primary_action == "answer"
    assert confirmation.material_question == "May customer data be sent to Gemini?"
    assert "Which heading style" not in confirmation.message
    assert confirmation.authorizes_external_actions is False

    proposed = build_scope_packet(
        _request(
            {
                "assumptions": [
                    {
                        "text": "Use synthetic data in examples",
                        "owner_confirmed": False,
                    }
                ],
                "decisions": [
                    {
                        "question": "Which heading style should be used?",
                        "status": "proposed",
                        "materiality": "non_material",
                        "proposal": "Use sentence case",
                    }
                ],
            }
        )
    )
    compact = build_scope_confirmation(proposed)
    assert compact.status == "proceed_or_edit"
    assert compact.primary_action == "proceed"
    assert compact.message.endswith("Reply ‘proceed’ or edit the scope.")
    assert "Assumptions:" in compact.message


def test_decision_response_and_immutable_snapshot_embed_the_same_scope_packet(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/scope-packet.db")
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            OrchestrationDecisionSnapshot.__table__,
            OrchestrationEvent.__table__,
        ],
    )
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add(User(user_id="axwise-user", email="scope@example.com", usage_data={}))
    session.commit()
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(session))

    try:
        record = service.create(
            _request(
                {
                    "assumptions": [
                        {
                            "text": "Use synthetic data in examples",
                            "owner_confirmed": False,
                        }
                    ]
                }
            ),
            "axwise-user",
            "scope-live-response",
        )
        row = (
            session.query(OrchestrationDecisionSnapshot)
            .filter(OrchestrationDecisionSnapshot.decision_id == record.decision_id)
            .one()
        )

        assert record.scope_packet is not None
        assert record.scope_packet == record.input_snapshot.scope_packet
        assert record.scope_validation.scope_hash == record.scope_packet.scope_hash
        assert record.scope_validation.valid is True
        assert record.scope_confirmation.scope_hash == record.scope_packet.scope_hash
        assert record.scope_confirmation.status == "proceed_or_edit"
        assert row.decision_payload["scope_packet"] == row.input_snapshot["scope_packet"]
        assert row.decision_payload["scope_validation"]["valid"] is True
        assert row.decision_payload["scope_confirmation"]["status"] == "proceed_or_edit"
    finally:
        session.close()
        engine.dispose()


def test_openapi_exports_native_scope_and_quality_schemas():
    app = FastAPI()
    app.include_router(orchestration_route.router)
    schema = app.openapi()
    base = "/api/orqaly-axwise/v1/orchestration"

    assert f"{base}/schemas/scope-packet-v1" in schema["paths"]
    assert f"{base}/schemas/scope-state-v1" in schema["paths"]
    assert f"{base}/schemas/quality-contract-v1" in schema["paths"]
    request_properties = schema["components"]["schemas"][
        "DecisionCreateRequestV1-Input"
    ]["properties"]
    decision_properties = schema["components"]["schemas"][
        "OrchestrationDecisionRecordV1"
    ]["properties"]
    assert {"scope_state", "scope_packet"}.issubset(request_properties)
    assert {"scope_packet", "scope_validation", "scope_confirmation"}.issubset(
        decision_properties
    )
