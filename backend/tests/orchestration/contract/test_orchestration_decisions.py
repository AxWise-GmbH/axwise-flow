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
    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers(example_name),
        json=_payload(example_name),
    )

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["contract_version"] == "1.0"
    assert data["scorer_version"] == "weighted-direct-v1.0.0"
    assert data["requires_orqaly_authorization"] is True
    assert data["recommended_agents"][0]["eligible"] is True
    assert data["input_snapshot"]["task"]["domain"] == _payload(example_name)["task"]["domain"]
    assert data["request_hash"]
    if _payload(example_name)["task"]["risk_level"] == "high":
        assert data["routing_mode"] == "human_controlled"
        assert data["approval_points"][0]["required_before"] == "execution"
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

    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("hard-eligibility"),
        json=payload,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["recommended_agents"][0]["agent_id"] != "agent-cross-tenant-superstar"
    excluded = next(
        item
        for item in data["candidate_rankings"]
        if item["agent_id"] == "agent-cross-tenant-superstar"
    )
    assert excluded["eligible"] is False
    assert excluded["score"] == 0
    assert "agent belongs to a different tenant" in excluded["exclusion_reasons"]


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

    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("human-escalation"),
        json=payload,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["routing_mode"] == "human_controlled"
    assert data["status"] == "escalated"
    assert data["recommended_agents"] == []
    assert data["confidence"] == 0
    assert data["approval_points"][0]["required_before"] == "assignment"


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

    response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("normalized-approval"),
        json=payload,
    )

    assert response.status_code == 201
    data = response.json()
    assert data["recommended_agents"][0]["eligible"] is True
    assert data["routing_mode"] == "human_controlled"
    assert (
        "configured actions require approval"
        in data["approval_points"][0]["reason"]
    )


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
    parent_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("phase3-api-parent"),
        json=payload,
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

    assert parent_response.status_code == 201
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
    decision_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("phase4-decision"),
        json=_phase3_payload(),
    )
    assert decision_response.status_code == 201, decision_response.text
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
    decision_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("phase4-currency-decision"),
        json=_phase3_payload(),
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
    decision_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("phase4-node-failure-decision"),
        json=_phase3_payload(),
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
        decision_response = await client.post(
            "/api/orqaly-axwise/v1/orchestration/decisions",
            headers=_post_headers(f"history-decision-{index}"),
            json=request,
        )
        assert decision_response.status_code == 201, decision_response.text
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
    learned = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("later-learned"),
        json=later,
    )
    assert learned.status_code == 201, learned.text
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
    baseline = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("later-restored"),
        json=restored,
    )
    assert baseline.status_code == 201, baseline.text
    baseline_decision = baseline.json()
    assert baseline_decision["scorer_version"] == "weighted-direct-v1.0.0"
    assert baseline_decision["recommended_agents"][0]["agent_id"] == "agent-a"
    assert baseline_decision["learned_features"] == []


@pytest.mark.asyncio
async def test_final_plan_links_to_the_preplanning_context_decision(
    orchestration_client,
):
    client, _ = orchestration_client
    context_payload = _payload("customer_escalation")
    context_payload["task"]["task_id"] = "linked-goal"
    context_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("linked-context"),
        json=context_payload,
    )
    assert context_response.status_code == 201, context_response.text
    context = context_response.json()

    plan_payload = _phase3_payload()
    plan_payload["task"]["task_id"] = "linked-goal"
    plan_payload["upstream_decision_id"] = context["decision_id"]
    plan_response = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("linked-plan"),
        json=plan_payload,
    )
    assert plan_response.status_code == 201, plan_response.text
    assert plan_response.json()["parent_decision_id"] == context["decision_id"]

    foreign_payload = deepcopy(plan_payload)
    foreign_payload["tenant"] = {
        "userId": "orqaly-user-2",
        "orgId": "orqaly-org-2",
    }
    for agent in foreign_payload["available_agents"]:
        agent["org_id"] = "orqaly-org-2"
    for tool in foreign_payload["available_tools"]:
        tool["org_id"] = "orqaly-org-2"
    foreign = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_post_headers("linked-foreign"),
        json=foreign_payload,
    )
    assert foreign.status_code == 404
    assert foreign.headers["X-Request-ID"] == "trace-linked-foreign"
    assert foreign.json()["detail"] == {
        "code": "AXWISE_UPSTREAM_DECISION_NOT_FOUND",
        "message": "upstream orchestration decision was not found",
        "request_id": "trace-linked-foreign",
    }


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
