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
from sqlalchemy import Column, MetaData, String, Table, create_engine, inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api.routes.orchestration import router
from backend.database import Base, get_db
from backend.domain.orchestration.examples import ORCHESTRATION_DECISION_EXAMPLES
from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationEvent,
    OrqalyTenantMapping,
    User,
)
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
