"""Phase 1 orchestration contract, tenancy, and deterministic-scoring tests."""

from __future__ import annotations

from copy import deepcopy
import importlib

import httpx
import pytest
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import FastAPI
from sqlalchemy import Column, MetaData, String, Table, create_engine, event, inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api.routes.orchestration import router
from backend.database import Base, get_db
from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.domain.orchestration.models import EvaluationSliceV1
from backend.domain.orchestration.scope_models import canonical_scope_action_id
from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationEvent,
    OrchestrationExecutionReceipt,
    OrchestrationOutcome,
    OrchestrationScorerVersion,
    OrqalyTenantMapping,
    User,
)
from backend.services.orchestration.assignment_scorer import WEIGHTS
from backend.services.orchestration.evaluation_service import ScorerEvaluationService
from backend.services.orchestration.scorer_registry import ScorerRegistryService
from backend.services.orqaly_research_bundle_service import canonical_hash
from backend.tests.orchestration.unit.test_team_planner import planning_payload


pytestmark = pytest.mark.contract
SERVICE_KEY = "test-orchestration-service-key"
BASE_HEADERS = {"x-axwise-key": SERVICE_KEY}


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs):
    return "JSON"


def _payload(example_name: str = "software_incident") -> dict:
    payload = deepcopy(ORCHESTRATION_DECISION_EXAMPLES[example_name]["value"])
    payload["tenant"] = {"userId": "orqaly-user-1", "orgId": "orqaly-org-1"}
    for agent in payload["available_agents"]:
        agent["org_id"] = "orqaly-org-1"
    for tool in payload["available_tools"]:
        tool["org_id"] = "orqaly-org-1"
    return payload


def _post_headers(key: str) -> dict:
    return {**BASE_HEADERS, "Idempotency-Key": key, "X-Request-ID": f"trace-{key}"}


def _get_headers(org_id: str, user_id: str) -> dict:
    return {
        **BASE_HEADERS,
        "X-Orqaly-Org-ID": org_id,
        "X-Orqaly-User-ID": user_id,
    }


def _phase3_payload() -> dict:
    payload = planning_payload("sequential", "software_operations")
    payload["tenant"] = {"userId": "orqaly-user-1", "orgId": "orqaly-org-1"}
    for agent in payload["available_agents"]:
        agent["org_id"] = "orqaly-org-1"
    for tool in payload["available_tools"]:
        tool["org_id"] = "orqaly-org-1"
    return payload


@pytest_asyncio.fixture
async def orchestration_client(tmp_path, monkeypatch):
    monkeypatch.setenv("AXWISE_API_KEY", SERVICE_KEY)
    engine = create_engine(
        f"sqlite:///{tmp_path}/orchestration.db",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add_all(
        [
            User(user_id="axwise-user-1", email="one@example.com", usage_data={}),
            User(user_id="axwise-user-2", email="two@example.com", usage_data={}),
        ]
    )
    session.flush()
    session.add_all(
        [
            OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id="orqaly-org-1",
                external_user_id="orqaly-user-1",
                user_id="axwise-user-1",
                active=True,
            ),
            OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id="orqaly-org-2",
                external_user_id="orqaly-user-2",
                user_id="axwise-user-2",
                active=True,
            ),
            OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id="orqaly-org-1",
                external_user_id="orqaly-user-peer",
                user_id="axwise-user-1",
                active=True,
            ),
        ]
    )
    session.commit()
    session.close()

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as client:
        yield client, factory
    engine.dispose()


async def _admit_and_accept(client, payload: dict, *, key: str):
    admission_payload = deepcopy(payload)
    admission_payload.pop("planning", None)
    proposal_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers(f"{key}-proposal"),
        json=admission_payload,
    )
    assert proposal_response.status_code == 201, proposal_response.text
    proposal_record = proposal_response.json()
    proposal = proposal_record["scope_proposal"]
    acceptance_request = {
        "version": "orqaly_scope_proposal_acceptance_request_v1",
        "org_id": proposal["org_id"],
        "user_id": proposal["user_id"],
        "task_id": proposal["task_id"],
        "proposal_decision_id": proposal["proposal_decision_id"],
        "scope_generation": proposal["scope_generation"],
        "scope_hash": proposal["scope_hash"],
        "contract_hash": proposal["contract_hash"],
        "proposal_hash": proposal["proposal_hash"],
        "proposal_inputs_hash": proposal["proposal_inputs_hash"],
        "research_execution_inputs_hash": proposal.get(
            "research_execution_inputs_hash"
        ),
    }
    acceptance_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/scope/proposals/"
        f"{proposal['proposal_decision_id']}/accept",
        headers=_get_headers(proposal["org_id"], proposal["user_id"]),
        json=acceptance_request,
    )
    assert acceptance_response.status_code == 201, acceptance_response.text
    return proposal_record, acceptance_response.json()


async def _consume_accepted(
    client,
    proposal_record: dict,
    acceptance: dict,
    payload: dict,
    *,
    key: str,
    purpose: str | None = None,
    expected_dispatch_status: int = 201,
):
    proposal = proposal_record["scope_proposal"]
    selected_purpose = purpose or ("planning" if payload.get("planning") else "assignment")
    catalogue = {
        "available_agents": deepcopy(payload.get("available_agents", [])),
        "available_tools": deepcopy(payload.get("available_tools", [])),
    }
    endpoint = (
        "/api/orqaly-axwise/v1/orchestration/scope/proposals/"
        f"{proposal['proposal_decision_id']}/consumers"
    )
    tenant_headers = _get_headers(proposal["org_id"], proposal["user_id"])

    def consumer_request(consumer_purpose: str, consumer_payload: dict, suffix: str):
        consumer_inputs = {
            "version": "orqaly_scope_consumer_inputs_v1",
            "purpose": consumer_purpose,
            "consumer_id": f"goal:{proposal['task_id']}:{consumer_purpose}:{suffix}",
            "task_id": proposal["task_id"],
            "scope_hash": proposal["scope_hash"],
            "scope_generation": proposal["scope_generation"],
            "payload": consumer_payload,
            "payload_hash": canonical_hash(consumer_payload),
        }
        return {
            "version": "orqaly_scope_continuation_request_v1",
            "proposal_decision_id": proposal["proposal_decision_id"],
            "acceptance_id": acceptance["acceptance_id"],
            "acceptance_hash": acceptance["acceptance_hash"],
            "consumer_inputs": consumer_inputs,
        }

    if selected_purpose == "assignment":
        planning_payload = {
            "planning": _scope_sealed_planning(
                proposal_record["scope_packet"],
                _single_step_planning(),
            ),
            "catalogue": catalogue,
        }
        planning_response = await client.post(
            endpoint,
            headers={
                **tenant_headers,
                "Idempotency-Key": f"{key}-planning-authority",
            },
            json=consumer_request("planning", planning_payload, f"{key}:authority"),
        )
        assert planning_response.status_code == 201, planning_response.text
        planning_receipt = planning_response.json()
        consumer_payload = {
            "authority_kind": "planning_projection",
            "catalogue": catalogue,
            "planning_projection_ref": {
                "version": "axwise_scope_planning_projection_ref_v1",
                "planning_decision_id": planning_receipt["decision_id"],
                "planning_continuation_binding_hash": planning_receipt[
                    "continuation"
                ]["binding_hash"],
                "planning_consumer_inputs_hash": planning_receipt[
                    "consumer_inputs_hash"
                ],
                "planning_projection_hash": planning_receipt[
                    "decision_projection"
                ]["projection_hash"],
            },
        }
    else:
        consumer_payload = {
            "planning": _scope_sealed_planning(
                proposal_record["scope_packet"],
                payload["planning"],
            ),
            "catalogue": catalogue,
        }
    request = consumer_request(selected_purpose, consumer_payload, key)
    dispatch_response = await client.post(
        endpoint,
        headers={
            **tenant_headers,
            "Idempotency-Key": f"{key}-consumer",
        },
        json=request,
    )
    assert (
        dispatch_response.status_code == expected_dispatch_status
    ), dispatch_response.text
    if expected_dispatch_status != 201:
        return dispatch_response, None
    receipt = dispatch_response.json()
    decision_id = receipt["decision_id"]
    decision_response = await client.get(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}",
        headers=_get_headers(proposal["org_id"], proposal["user_id"]),
    )
    assert decision_response.status_code == 200, decision_response.text
    projection = receipt["decision_projection"]
    decision = decision_response.json()
    assert projection["purpose"] == selected_purpose
    assert projection["decision_id"] == decision_id
    assert projection["decision_status"] == decision["status"]
    assert projection["routing_mode"] == decision["routing_mode"]
    assert projection["executable"] == decision["execution_plan"]["executable"]
    assert projection["projection_hash"]
    assert projection["advisory_only"] is True
    assert "input_snapshot" not in dispatch_response.text
    assert "candidate_rankings" not in dispatch_response.text
    assert "score" not in dispatch_response.text
    if selected_purpose == "assignment":
        assert [item["agent_id"] for item in projection["selected_agents"]] == [
            item["agent_id"] for item in decision["recommended_agents"]
        ]
    else:
        assert [item["node_id"] for item in projection["nodes"]] == [
            item["node_id"] for item in decision["execution_plan"]["nodes"]
        ]
        assert [item["dependencies"] for item in projection["nodes"]] == [
            item["dependencies"] for item in decision["execution_plan"]["nodes"]
        ]
    return dispatch_response, decision_response


def _single_step_planning() -> dict:
    return {
        "pattern": "single",
        "steps": [
            {
                "step_id": "accepted-scope-work",
                "title": "Complete the accepted scope",
                "objective": "Complete the accepted scope",
                "input_contract": {"placeholder": True},
                "output_contract": {"placeholder": True},
                "completion_criteria": ["The accepted outcome is complete"],
            }
        ],
    }


def _scope_sealed_planning(scope_packet: dict, requested: dict) -> dict:
    """Project a caller-authored plan onto the exact accepted scope ledger.

    These broad contract tests exercise the team planner, not an Orqaly plan
    author.  The production continuation boundary intentionally rejects the
    old free-form objectives/contracts.  Preserve the plan topology while
    binding every step to one accepted requirement and its acceptance rule.
    """

    requirements = scope_packet["ledger"]["requirements"]
    acceptance = scope_packet["ledger"]["acceptance"]
    usable: list[tuple[dict, list[str]]] = []
    for requirement in requirements:
        criteria = [
            criterion
            for rule in acceptance
            if requirement["requirement_id"] in rule.get("supports", [])
            for criterion in rule["then"]
        ]
        if criteria:
            usable.append((requirement, criteria))
    assert usable, "admitted scope must expose an acceptance-bound requirement"

    admitted_capabilities = {
        *scope_packet["admission"]["required_capabilities"],
        *(
            slot["role"]
            for slot in scope_packet["research_contract"]["executor_role_slots"]
        ),
    }
    admitted_tools = set(scope_packet["authority_snapshot"]["required_tools"])
    admitted_actions = {
        item["action"] for item in scope_packet["admission"]["requested_actions"]
    }
    deliverable = scope_packet["deliverable"]
    sealed_steps = []
    for index, source_step in enumerate(requested["steps"]):
        requirement, criteria = usable[index % len(usable)]
        requirement_ids = [requirement["requirement_id"]]
        step = deepcopy(source_step)
        step.update(
            {
                "objective": requirement["text"],
                "required_capabilities": [
                    capability
                    for capability in source_step.get("required_capabilities", [])
                    if capability in admitted_capabilities
                ],
                "preferred_capabilities": [
                    capability
                    for capability in source_step.get("preferred_capabilities", [])
                    if capability in admitted_capabilities
                ],
                "required_tools": [
                    tool
                    for tool in source_step.get("required_tools", [])
                    if tool in admitted_tools
                ],
                "requested_actions": [
                    action
                    for action in source_step.get("requested_actions", [])
                    if action in admitted_actions
                ],
                "reviewer_capabilities": [
                    capability
                    for capability in source_step.get("reviewer_capabilities", [])
                    if capability in admitted_capabilities
                ],
                "input_contract": {
                    "scope_hash": scope_packet["scope_hash"],
                    "requirement_ids": requirement_ids,
                },
                "output_contract": {
                    "scope_hash": scope_packet["scope_hash"],
                    "requirement_ids": requirement_ids,
                    "deliverable_type": deliverable["type"],
                    "deliverable_count": deliverable["count"],
                    "presentation": deliverable["presentation"],
                    "required_sections": deliverable["required_sections"],
                },
                "completion_criteria": [criteria[0]],
                "review_rules": [],
            }
        )
        sealed_steps.append(step)

    result = deepcopy(requested)
    result["steps"] = sealed_steps
    return result


async def _accepted_decision(client, payload: dict, *, key: str):
    proposal, acceptance = await _admit_and_accept(client, payload, key=key)
    _, decision = await _consume_accepted(
        client,
        proposal,
        acceptance,
        payload,
        key=key,
    )
    return decision


@pytest.mark.parametrize(
    "example_name",
    [
        "software_incident",
        "customer_escalation",
        "compliance_review",
        "marketing_preparation",
        "finance_analysis",
    ],
)
@pytest.mark.asyncio
async def test_one_contract_supports_five_operational_domains(
    orchestration_client, example_name
):
    client, _ = orchestration_client
    response = await _accepted_decision(
        client,
        _payload(example_name),
        key=example_name,
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["contract_version"] == "1.0"
    assert data["scorer_version"] == "weighted-direct-v1.0.0"
    assert data["requires_orqaly_authorization"] is True
    assert data["recommended_agents"][0]["eligible"] is True
    assert data["input_snapshot"]["task"]["domain"] == _payload(example_name)["task"]["domain"]
    assert data["request_hash"]
    if _payload(example_name)["task"]["risk_level"] == "high":
        assert data["routing_mode"] == "direct"
        assert any(
            item["required_before"] == "execution"
            for item in data["approval_points"]
        )
    else:
        assert data["routing_mode"] == "direct"
        assert data["execution_plan"]["nodes"][0]["assigned_agent_id"]


@pytest.mark.asyncio
async def test_ineligible_agent_cannot_win_with_a_higher_success_score(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _payload()
    payload["available_agents"].append(
        {
            **deepcopy(payload["available_agents"][0]),
            "agent_id": "agent-cross-tenant-superstar",
            "org_id": "orqaly-org-2",
            "name": "Cross-tenant Superstar",
            "success_rate": 1.0,
            "estimated_cost": 0,
            "estimated_latency_ms": 1,
        }
    )

    response = await _accepted_decision(
        client,
        payload,
        key="hard-eligibility",
    )

    assert response.status_code == 200
    data = response.json()
    assert data["recommended_agents"][0]["agent_id"] != "agent-cross-tenant-superstar"
    assert all(
        item["agent_id"] != "agent-cross-tenant-superstar"
        for item in data["candidate_rankings"]
    )


@pytest.mark.asyncio
async def test_idempotent_retry_reuses_snapshot_and_changed_input_conflicts(
    orchestration_client,
):
    client, factory = orchestration_client
    payload = _payload()
    first = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("idem-1"),
        json=payload,
    )
    retry = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("idem-1"),
        json=payload,
    )
    changed = deepcopy(payload)
    changed["task"]["objective"] = "A materially different operational objective"
    conflict = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("idem-1"),
        json=changed,
    )

    assert first.status_code == 201
    assert first.headers["X-Request-ID"] == "trace-idem-1"
    assert retry.status_code == 200
    assert retry.json()["reused"] is True
    assert retry.json()["decision_id"] == first.json()["decision_id"]
    assert conflict.status_code == 409
    session = factory()
    try:
        assert session.query(OrchestrationDecisionSnapshot).count() == 1
        assert session.query(OrchestrationEvent).count() == 1
    finally:
        session.close()


@pytest.mark.asyncio
async def test_decision_retrieval_is_tenant_isolated_and_auditable(
    orchestration_client,
):
    client, _ = orchestration_client
    created = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("tenant-read"),
        json=_payload(),
    )
    decision_id = created.json()["decision_id"]
    owner_read = await client.get(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}",
        headers=_get_headers("orqaly-org-1", "orqaly-user-1"),
    )
    other_tenant_read = await client.get(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}",
        headers=_get_headers("orqaly-org-2", "orqaly-user-2"),
    )
    peer_read = await client.get(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}",
        headers=_get_headers("orqaly-org-1", "orqaly-user-peer"),
    )
    peer_payload = _payload()
    peer_payload["tenant"]["userId"] = "orqaly-user-peer"
    peer_create = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("tenant-read"),
        json=peer_payload,
    )

    assert owner_read.status_code == 200
    assert owner_read.json()["input_snapshot"] == created.json()["input_snapshot"]
    assert owner_read.json()["request_hash"] == created.json()["request_hash"]
    assert other_tenant_read.status_code == 404
    assert peer_read.status_code == 404
    assert peer_create.status_code == 409
    assert "decision_id" not in peer_create.json()


@pytest.mark.asyncio
async def test_unknown_contract_and_unstructured_secret_claims_are_rejected(
    orchestration_client,
):
    client, _ = orchestration_client
    unknown_version = _payload()
    unknown_version["contract_version"] = "2.0"
    version_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("bad-version"),
        json=unknown_version,
    )
    secret_claim = _payload()
    secret_claim["api_secret"] = "browser-asserted-secret"
    secret_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("bad-secret"),
        json=secret_claim,
    )
    compatible_v1 = _payload()
    compatible_v1.pop("contract_version")
    compatible_v1["task"].pop("contract_version")
    compatible_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("compatible-v1"),
        json=compatible_v1,
    )

    assert version_response.status_code == 422
    assert secret_response.status_code == 422
    assert compatible_response.status_code == 201
    assert compatible_response.json()["contract_version"] == "1.0"


@pytest.mark.asyncio
async def test_no_eligible_agent_creates_explicit_human_escalation(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _payload()
    payload["available_agents"][0]["availability"] = "offline"

    proposal, acceptance = await _admit_and_accept(
        client, payload, key="human-escalation"
    )
    response, _ = await _consume_accepted(
        client,
        proposal,
        acceptance,
        payload,
        key="human-escalation",
        expected_dispatch_status=409,
    )

    assert response.status_code == 409
    assert "not executable, feasible, and assignable" in response.json()["detail"]
    assert proposal["routing_mode"] == "human_controlled"
    assert proposal["status"] == "escalated"
    assert proposal["recommended_agents"] == []
    assert proposal["confidence"] == 0
    assert any(
        item["required_before"] == "assignment"
        for item in proposal["approval_points"]
    )


@pytest.mark.asyncio
async def test_approval_action_matching_uses_normalized_vocabulary(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _payload()
    payload["task"]["requested_actions"] = ["Analyze Repository"]
    payload["policy_context"]["human_approval_required_for"] = [
        "ANALYZE-REPOSITORY"
    ]

    proposal_record, _ = await _admit_and_accept(
        client,
        payload,
        key="normalized-approval",
    )

    packet = proposal_record["scope_packet"]
    admitted = packet["admission"]["requested_actions"]
    approval_actions = packet["authority_snapshot"]["approval_actions"]
    assert [canonical_scope_action_id(item["action"]) for item in admitted] == [
        "analyze_repository"
    ]
    assert [canonical_scope_action_id(item) for item in approval_actions] == [
        "analyze_repository"
    ]


@pytest.mark.asyncio
async def test_ranked_result_replays_deterministically_across_decisions(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _payload()
    first = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("replay-1"),
        json=payload,
    )
    second = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("replay-2"),
        json=payload,
    )

    assert first.status_code == 201
    assert second.status_code == 201
    first_data = first.json()
    second_data = second.json()
    assert first_data["request_hash"] == second_data["request_hash"]
    assert first_data["candidate_rankings"] == second_data["candidate_rankings"]
    assert first_data["required_capabilities"] == second_data["required_capabilities"]
    assert first_data["decision_id"] != second_data["decision_id"]


@pytest.mark.asyncio
async def test_published_json_schema_requires_m2m_authentication(
    orchestration_client,
):
    client, _ = orchestration_client
    missing = await client.get(
        "/api/orqaly-axwise/v1/orchestration/schemas/decision-request-v1"
    )
    response = await client.get(
        "/api/orqaly-axwise/v1/orchestration/schemas/decision-request-v1",
        headers=BASE_HEADERS,
    )

    assert missing.status_code == 401
    assert response.status_code == 200
    assert response.json()["properties"]["contract_version"]["const"] == "1.0"


@pytest.mark.asyncio
async def test_phase3_replan_api_is_linked_idempotent_and_exact_user_isolated(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _phase3_payload()
    parent_response = await _accepted_decision(
        client,
        payload,
        key="phase3-api-parent",
    )
    parent = parent_response.json()
    original = next(
        agent
        for agent in payload["available_agents"]
        if agent["agent_id"] == "agent-research"
    )
    replacement = {
        **deepcopy(original),
        "agent_id": "agent-research-api-substitute",
        "name": "API Research Substitute",
    }
    change = {
        "trigger": "agent_unavailable",
        "reason": "current owner is unavailable",
        "failed_node_id": "research",
        "unavailable_agent_ids": ["agent-research"],
        "replacement_agents": [replacement],
    }
    headers = {
        **_get_headers("orqaly-org-1", "orqaly-user-1"),
        "Idempotency-Key": "phase3-api-replan",
    }
    endpoint = (
        "/api/orqaly-axwise/v1/orchestration/decisions/"
        f"{parent['decision_id']}/replan"
    )
    replanned = await client.post(endpoint, headers=headers, json=change)
    retry = await client.post(endpoint, headers=headers, json=change)
    changed = await client.post(
        endpoint,
        headers=headers,
        json={**change, "reason": "materially different reason"},
    )
    peer = await client.post(
        endpoint,
        headers={
            **_get_headers("orqaly-org-1", "orqaly-user-peer"),
            "Idempotency-Key": "phase3-api-peer",
        },
        json=change,
    )

    assert parent_response.status_code == 200
    assert replanned.status_code == 201
    assert replanned.json()["parent_decision_id"] == parent["decision_id"]
    assert replanned.json()["routing_mode"] == "recovery"
    assert retry.status_code == 200
    assert retry.json()["reused"] is True
    assert changed.status_code == 409
    assert peer.status_code == 404


def test_phase3_openapi_publishes_planning_and_replan_contracts():
    app = FastAPI()
    app.include_router(router)
    schema = app.openapi()
    base = "/api/orqaly-axwise/v1/orchestration"

    assert f"{base}/decisions/{{decision_id}}/replan" in schema["paths"]
    request_properties = schema["components"]["schemas"][
        "DecisionCreateRequestV1-Input"
    ]["properties"]
    examples = schema["paths"][f"{base}/decisions"]["post"]["requestBody"][
        "content"
    ]["application/json"]["examples"]
    replan_properties = schema["components"]["schemas"][
        "ReplanRequestV1"
    ]["properties"]
    assert "planning" in request_properties
    assert "multi_agent_plan" in examples
    assert {
        "trigger",
        "failed_node_id",
        "unavailable_agent_ids",
        "failed_tool_ids",
        "updated_budget",
    }.issubset(replan_properties)


def test_phase1_migration_upgrades_and_downgrades_on_sqlite(
    tmp_path,
    monkeypatch,
):
    migration = importlib.import_module(
        "backend.migrations.versions.20260716_1500_add_orchestration_decisions"
    )
    engine = create_engine(f"sqlite:///{tmp_path}/migration.db")
    metadata = MetaData()
    Table("users", metadata, Column("user_id", String, primary_key=True))
    metadata.create_all(engine)

    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        monkeypatch.setattr(migration, "op", Operations(context))

        migration.upgrade()
        tables_after_upgrade = set(inspect(connection).get_table_names())
        assert "orchestration_decisions" in tables_after_upgrade
        assert "orchestration_events" in tables_after_upgrade

        migration.downgrade()
        tables_after_downgrade = set(inspect(connection).get_table_names())
        assert "orchestration_decisions" not in tables_after_downgrade
        assert "orchestration_events" not in tables_after_downgrade

    engine.dispose()


@pytest.mark.asyncio
async def test_phase4_outcome_is_idempotent_tenant_scoped_and_audited(
    orchestration_client,
):
    client, factory = orchestration_client
    decision_response = await _accepted_decision(
        client,
        _phase3_payload(),
        key="phase4-decision",
    )
    assert decision_response.status_code == 200, decision_response.text
    decision = decision_response.json()
    node = decision["execution_plan"]["nodes"][0]
    outcome = {
        "contract_version": "1.0",
        "outcome_id": "outcome-phase4-1",
        "decision_id": decision["decision_id"],
        "authorization_status": "approved",
        "execution_status": "completed",
        "task_success": True,
        "quality_score": 0.92,
        "stakeholder_acceptance": 0.9,
        "cost": decision["execution_plan"]["total_estimated_cost"],
        "currency": "EUR",
        "latency_ms": decision["execution_plan"]["critical_path_latency_ms"],
        "node_receipts": [
            {
                "receipt_id": "receipt-phase4-1",
                "node_id": node["node_id"],
                "agent_id": node["assigned_agent_id"],
                "attempt": 1,
                "status": "completed",
                "quality_score": 0.92,
                "currency": "EUR",
            }
        ],
    }
    headers = {
        **_get_headers("orqaly-org-1", "orqaly-user-1"),
        "Idempotency-Key": "phase4-outcome-key",
    }
    path = (
        "/api/orqaly-axwise/v1/orchestration/decisions/"
        f"{decision['decision_id']}/outcomes"
    )
    created = await client.post(path, headers=headers, json=outcome)
    assert created.status_code == 201, created.text
    record = created.json()
    assert record["evaluation"]["task_success"] is True
    assert record["evaluation"]["promotable_observation"] is True
    assert record["evaluation"]["safety_flags"] == []

    listed = await client.get(
        path,
        headers=_get_headers("orqaly-org-1", "orqaly-user-1"),
    )
    assert listed.status_code == 200, listed.text
    assert [item["outcome"]["outcome_id"] for item in listed.json()] == [
        outcome["outcome_id"]
    ]

    reused = await client.post(path, headers=headers, json=outcome)
    assert reused.status_code == 200
    assert reused.json()["reused"] is True
    changed = deepcopy(outcome)
    changed["quality_score"] = 0.2
    assert (await client.post(path, headers=headers, json=changed)).status_code == 409
    assert (
        await client.get(
            path,
            headers=_get_headers("orqaly-org-2", "orqaly-user-2"),
        )
    ).status_code == 404

    session = factory()
    try:
        assert session.query(OrchestrationOutcome).count() == 1
        assert session.query(OrchestrationExecutionReceipt).count() == 1
        assert (
            session.query(OrchestrationEvent)
            .filter(OrchestrationEvent.event_type == "outcome.received")
            .count()
            == 1
        )
    finally:
        session.close()


@pytest.mark.asyncio
async def test_phase4_currency_mismatch_is_preserved_but_never_promotable(
    orchestration_client,
):
    client, _ = orchestration_client
    decision_response = await _accepted_decision(
        client,
        _phase3_payload(),
        key="phase4-currency-decision",
    )
    decision = decision_response.json()
    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions/"
        f"{decision['decision_id']}/outcomes",
        headers={
            **_get_headers("orqaly-org-1", "orqaly-user-1"),
            "Idempotency-Key": "phase4-currency-outcome",
        },
        json={
            "contract_version": "1.0",
            "outcome_id": "outcome-phase4-currency",
            "decision_id": decision["decision_id"],
            "authorization_status": "approved",
            "execution_status": "completed",
            "task_success": True,
            "quality_score": 0.95,
            "cost": decision["execution_plan"]["total_estimated_cost"],
            "currency": "USD",
        },
    )

    assert response.status_code == 201, response.text
    evaluation = response.json()["evaluation"]
    assert evaluation["expected_currency"] == "EUR"
    assert evaluation["currency_matches"] is False
    assert evaluation["cost_delta_ratio"] is None
    assert "currency_mismatch" in evaluation["safety_flags"]
    assert evaluation["promotable_observation"] is False


@pytest.mark.asyncio
async def test_failed_node_receipt_cannot_be_overridden_by_claimed_task_success(
    orchestration_client,
):
    client, _ = orchestration_client
    decision_response = await _accepted_decision(
        client,
        _phase3_payload(),
        key="phase4-node-failure-decision",
    )
    decision = decision_response.json()
    node = decision["execution_plan"]["nodes"][0]
    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions/"
        f"{decision['decision_id']}/outcomes",
        headers={
            **_get_headers("orqaly-org-1", "orqaly-user-1"),
            "Idempotency-Key": "phase4-node-failure-outcome",
        },
        json={
            "contract_version": "1.0",
            "outcome_id": "outcome-phase4-node-failure",
            "decision_id": decision["decision_id"],
            "authorization_status": "approved",
            "execution_status": "completed",
            "task_success": True,
            "quality_score": 0.95,
            "currency": "EUR",
            "node_receipts": [
                {
                    "receipt_id": "receipt-phase4-node-failure",
                    "node_id": node["node_id"],
                    "agent_id": node["assigned_agent_id"],
                    "status": "failed",
                    "failure_type": "invalid_output",
                    "currency": "EUR",
                }
            ],
        },
    )

    assert response.status_code == 201, response.text
    evaluation = response.json()["evaluation"]
    assert "node_failure_observed" in evaluation["safety_flags"]
    assert evaluation["promotable_observation"] is False


@pytest.mark.asyncio
async def test_human_reviewed_outcomes_change_ranking_and_rollback_restores_it(
    orchestration_client,
):
    client, factory = orchestration_client
    seed = _payload("customer_escalation")
    history_agent = deepcopy(seed["available_agents"][0])
    history_agent.update(agent_id="agent-history", name="History Agent")
    history_agent.pop("success_rate", None)

    for index in range(3):
        request = deepcopy(seed)
        request["task"]["task_id"] = f"history-task-{index}"
        request["available_agents"] = [deepcopy(history_agent)]
        decision_response = await _accepted_decision(
            client,
            request,
            key=f"history-decision-{index}",
        )
        assert decision_response.status_code == 200, decision_response.text
        decision = decision_response.json()
        node = decision["execution_plan"]["nodes"][0]
        submitted = await client.post(
            "/api/orqaly-axwise/v1/orchestration/decisions/"
            f"{decision['decision_id']}/outcomes",
            headers={
                **_get_headers("orqaly-org-1", "orqaly-user-1"),
                "Idempotency-Key": f"history-outcome-{index}",
            },
            json={
                "contract_version": "1.0",
                "outcome_id": f"history-outcome-{index}",
                "decision_id": decision["decision_id"],
                "authorization_status": "approved",
                "execution_status": "completed",
                "task_success": True,
                "quality_score": 0.95,
                "stakeholder_acceptance": 0.95,
                "currency": seed["budget"]["currency"],
                "node_receipts": [
                    {
                        "receipt_id": f"history-receipt-{index}",
                        "node_id": node["node_id"],
                        "agent_id": node["assigned_agent_id"],
                        "status": "completed",
                        "quality_score": 0.95,
                        "currency": seed["budget"]["currency"],
                    }
                ],
            },
        )
        assert submitted.status_code == 201, submitted.text

    session = factory()
    try:
        registry = ScorerRegistryService(session)
        registry.register_candidate(
            external_org_id="orqaly-org-1",
            version="weighted-outcome-v1.1.0",
            weights=WEIGHTS,
            minimum_samples=3,
        )
        report = ScorerEvaluationService().build_report(
            report_id="report-phase4-passing",
            external_org_id="orqaly-org-1",
            candidate_version="weighted-outcome-v1.1.0",
            baseline_version="weighted-direct-v1.0.0",
            dataset_id="golden-cross-domain-v1",
            sample_count=30,
            overall_success_delta=0.04,
            cost_delta=0.0,
            calibration_error=0.05,
            drift_score=0.05,
            slices=[
                EvaluationSliceV1(
                    slice_name="minority-domain",
                    sample_count=5,
                    success_delta=0.01,
                )
            ],
        )
        registry.promote(
            external_org_id="orqaly-org-1",
            version="weighted-outcome-v1.1.0",
            report=report,
            reviewed_by="human-reviewer-1",
        )
    finally:
        session.close()

    later = deepcopy(seed)
    later["task"]["task_id"] = "later-task"
    alphabetical_agent = deepcopy(history_agent)
    alphabetical_agent.update(agent_id="agent-a", name="Alphabetical Agent")
    later["available_agents"] = [alphabetical_agent, deepcopy(history_agent)]
    learned = await _accepted_decision(
        client,
        later,
        key="later-learned",
    )
    assert learned.status_code == 200, learned.text
    learned_decision = learned.json()
    assert learned_decision["scorer_version"] == "weighted-outcome-v1.1.0"
    assert learned_decision["recommended_agents"][0]["agent_id"] == "agent-history"
    assert learned_decision["learned_features"][0]["sample_count"] == 3
    assert learned_decision["learned_features"][0]["external_org_id"] == "orqaly-org-1"
    assert (
        learned_decision["learned_features"][0]["provenance"]
        == "orchestration_execution_receipts"
    )

    session = factory()
    try:
        ScorerRegistryService(session).rollback(
            external_org_id="orqaly-org-1",
            version="weighted-outcome-v1.1.0",
            reviewed_by="human-reviewer-2",
        )
    finally:
        session.close()

    restored = deepcopy(later)
    restored["task"]["task_id"] = "restored-task"
    baseline = await _accepted_decision(
        client,
        restored,
        key="later-restored",
    )
    assert baseline.status_code == 200, baseline.text
    baseline_decision = baseline.json()
    assert baseline_decision["scorer_version"] == "weighted-direct-v1.0.0"
    assert baseline_decision["recommended_agents"][0]["agent_id"] == "agent-a"
    assert baseline_decision["learned_features"] == []


@pytest.mark.asyncio
async def test_final_plan_links_to_the_preplanning_context_decision(
    orchestration_client,
):
    client, _ = orchestration_client
    plan_payload = _phase3_payload()
    plan_payload["task"]["task_id"] = "linked-goal"
    context, acceptance = await _admit_and_accept(
        client,
        plan_payload,
        key="linked-context",
    )
    _, plan_response = await _consume_accepted(
        client,
        context,
        acceptance,
        plan_payload,
        key="linked-plan",
        purpose="planning",
    )
    proposal_id = context["scope_proposal"]["proposal_decision_id"]
    assert plan_response.json()["parent_decision_id"] == proposal_id

    foreign = await client.get(
        "/api/orqaly-axwise/v1/orchestration/decisions/"
        f"{plan_response.json()['decision_id']}",
        headers=_get_headers("orqaly-org-2", "orqaly-user-2"),
    )
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_compact_planning_projection_retains_only_operational_contract(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _phase3_payload()
    proposal, acceptance = await _admit_and_accept(
        client,
        payload,
        key="projection-operational",
    )
    receipt, decision_response = await _consume_accepted(
        client,
        proposal,
        acceptance,
        payload,
        key="projection-operational",
        purpose="planning",
    )
    projection = receipt.json()["decision_projection"]
    node = projection["nodes"][0]

    assert projection["validation_status"] == "feasible"
    assert projection["validation_rejections"] == []
    required_node_fields = {
        "node_id",
        "title",
        "assigned_agent_id",
        "required_capabilities",
        "tool_ids",
        "dependencies",
        "input_contract",
        "output_contract",
        "completion_criteria",
        "approval_gate_ids",
        "review_rules",
        "budget",
        "estimated_cost",
        "estimated_latency_ms",
        "failure_policy",
    }
    assert required_node_fields.issubset(node)
    assert set(node).issubset({*required_node_fields, "reviewer_agent_id"})
    assert projection["projection_hash"]
    assert "input_snapshot" not in receipt.text
    assert "candidate_rankings" not in receipt.text
    assert "reason" not in receipt.text.casefold()
    assert decision_response.json()["input_snapshot"]


@pytest.mark.asyncio
async def test_compact_planning_rejections_keep_repair_ids_without_reasons(
    orchestration_client,
):
    client, _ = orchestration_client
    payload = _phase3_payload()
    for agent in payload["available_agents"]:
        agent["availability"] = "offline"
    proposal, acceptance = await _admit_and_accept(
        client,
        payload,
        key="projection-rejected",
    )
    receipt, _ = await _consume_accepted(
        client,
        proposal,
        acceptance,
        payload,
        key="projection-rejected",
        purpose="planning",
    )
    projection = receipt.json()["decision_projection"]

    assert projection["validation_status"] == "rejected"
    assert projection["validation_rejections"]
    assert all(
        set(item).issubset({"code", "node_id", "agent_id", "tool_id"})
        for item in projection["validation_rejections"]
    )
    assert "reason" not in receipt.text.casefold()


@pytest.mark.asyncio
async def test_unsafe_or_costly_scorer_report_cannot_be_promoted(
    orchestration_client,
):
    _, factory = orchestration_client
    session = factory()
    try:
        registry = ScorerRegistryService(session)
        registry.register_candidate(
            external_org_id="orqaly-org-1",
            version="unsafe-scorer-v1",
            weights=WEIGHTS,
        )
        changed_weights = dict(WEIGHTS)
        changed_weights["required_capability_coverage"] -= 0.01
        changed_weights["preferred_capability_coverage"] += 0.01
        with pytest.raises(ValueError, match="immutable"):
            registry.register_candidate(
                external_org_id="orqaly-org-1",
                version="unsafe-scorer-v1",
                weights=changed_weights,
            )
        report = ScorerEvaluationService().build_report(
            report_id="unsafe-report",
            external_org_id="orqaly-org-1",
            candidate_version="unsafe-scorer-v1",
            baseline_version="weighted-direct-v1.0.0",
            dataset_id="golden-cross-domain-v1",
            sample_count=30,
            overall_success_delta=0.02,
            cost_delta=0.4,
            calibration_error=0.05,
            drift_score=0.05,
            slices=[
                EvaluationSliceV1(
                    slice_name="regulated-minority",
                    sample_count=4,
                    success_delta=-0.2,
                    safety_regressions=1,
                )
            ],
        )
        assert report.passed is False
        assert "material_cost_regression" in report.blockers
        with pytest.raises(ValueError, match="passing"):
            registry.promote(
                external_org_id="orqaly-org-1",
                version="unsafe-scorer-v1",
                report=report,
                reviewed_by="human-reviewer",
            )
        forged = report.model_copy(update={"passed": True, "blockers": []})
        with pytest.raises(ValueError, match="passing"):
            registry.promote(
                external_org_id="orqaly-org-1",
                version="unsafe-scorer-v1",
                report=forged,
                reviewed_by="human-reviewer",
            )
        tenant_mismatch = ScorerEvaluationService().build_report(
            report_id="wrong-tenant-report",
            external_org_id="orqaly-org-2",
            candidate_version="unsafe-scorer-v1",
            baseline_version="weighted-direct-v1.0.0",
            dataset_id="golden-cross-domain-v1",
            sample_count=30,
            overall_success_delta=0.02,
            cost_delta=0.0,
            calibration_error=0.05,
            drift_score=0.05,
            slices=[],
        )
        with pytest.raises(ValueError, match="tenant-bound"):
            registry.promote(
                external_org_id="orqaly-org-1",
                version="unsafe-scorer-v1",
                report=tenant_mismatch,
                reviewed_by="human-reviewer",
            )
        row = (
            session.query(OrchestrationScorerVersion)
            .filter(OrchestrationScorerVersion.version == "unsafe-scorer-v1")
            .one()
        )
        assert row.status == "candidate"
    finally:
        session.close()


def test_phase4_migration_upgrades_and_downgrades_on_sqlite(tmp_path, monkeypatch):
    phase1 = importlib.import_module(
        "backend.migrations.versions.20260716_1500_add_orchestration_decisions"
    )
    phase4 = importlib.import_module(
        "backend.migrations.versions.20260718_1000_add_orchestration_outcomes"
    )
    engine = create_engine(f"sqlite:///{tmp_path}/phase4-migration.db")
    metadata = MetaData()
    Table("users", metadata, Column("user_id", String, primary_key=True))
    metadata.create_all(engine)
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        operations = Operations(context)
        monkeypatch.setattr(phase1, "op", operations)
        monkeypatch.setattr(phase4, "op", operations)
        phase1.upgrade()
        phase4.upgrade()
        tables = set(inspect(connection).get_table_names())
        assert "orchestration_outcomes" in tables
        assert "orchestration_execution_receipts" in tables
        assert "orchestration_scorer_versions" in tables
        phase4.downgrade()
        tables = set(inspect(connection).get_table_names())
        assert "orchestration_outcomes" not in tables
        assert "orchestration_execution_receipts" not in tables
        assert "orchestration_scorer_versions" not in tables
    engine.dispose()
