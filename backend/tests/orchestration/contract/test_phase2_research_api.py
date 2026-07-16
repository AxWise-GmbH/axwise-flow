"""Authenticated Phase 2 API contract for pending and completed research."""

from __future__ import annotations

from copy import deepcopy

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.routes import orchestration as orchestration_route
from backend.database import Base, get_db
from backend.domain.orchestration.models import (
    EvidenceItemV1,
    ResearchJobV1,
    ResearchResultV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
)
from backend.models import (
    OrchestrationDecisionSnapshot,
    OrchestrationEvent,
    OrqalyTenantMapping,
    User,
)
from backend.services.orchestration.decision_service import OrchestrationDecisionService
from backend.tests.orchestration.unit.test_uncertainty_router import (
    _ambiguous_research_payload,
)


pytestmark = pytest.mark.contract
SERVICE_KEY = "phase2-api-key"


class ApiResearchPort:
    def __init__(self):
        self.result = None

    def start(self, request, decision_id, idempotency_key):
        return ResearchJobV1(
            job_id=f"api-research-{idempotency_key}",
            status="queued",
            decision_id=decision_id,
        )

    def collect(self, request, job):
        return self.result or ResearchResultV1(job=job)


@pytest_asyncio.fixture
async def phase2_client(tmp_path, monkeypatch):
    monkeypatch.setenv("AXWISE_API_KEY", SERVICE_KEY)
    engine = create_engine(
        f"sqlite:///{tmp_path}/phase2-api.db",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            OrqalyTenantMapping.__table__,
            OrchestrationDecisionSnapshot.__table__,
            OrchestrationEvent.__table__,
        ],
    )
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add(User(user_id="axwise-user", email="api@example.com", usage_data={}))
    session.flush()
    session.add_all(
        [
            OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id="orqaly-org-example",
                external_user_id="orqaly-user-example",
                user_id="axwise-user",
                active=True,
            ),
            OrqalyTenantMapping(
                partner_id="orqaly",
                external_org_id="orqaly-org-example",
                external_user_id="orqaly-user-peer",
                user_id="axwise-user",
                active=True,
            ),
        ]
    )
    session.commit()
    session.close()
    research = ApiResearchPort()

    def override_get_db():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    def service_factory(db, user=None, tenant=None):
        return OrchestrationDecisionService(
            SqlAlchemyDecisionStore(db),
            research_port=research,
        )

    monkeypatch.setattr(orchestration_route, "_service", service_factory)
    app = FastAPI()
    app.include_router(orchestration_route.router)
    app.dependency_overrides[get_db] = override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        yield client, research
    engine.dispose()


def _create_headers(key: str):
    return {
        "x-axwise-key": SERVICE_KEY,
        "Idempotency-Key": key,
        "X-Request-ID": f"trace-{key}",
    }


def _tenant_headers(user_id: str = "orqaly-user-example"):
    return {
        "x-axwise-key": SERVICE_KEY,
        "X-Orqaly-Org-ID": "orqaly-org-example",
        "X-Orqaly-User-ID": user_id,
    }


def test_phase2_openapi_publishes_refresh_fields_and_bounded_research_example():
    app = FastAPI()
    app.include_router(orchestration_route.router)
    schema = app.openapi()
    base = "/api/orqaly-axwise/v1/orchestration"
    paths = schema["paths"]
    assert f"{base}/decisions/{{decision_id}}/research/refresh" in paths
    examples = paths[f"{base}/decisions"]["post"]["requestBody"]["content"][
        "application/json"
    ]["examples"]
    properties = schema["components"]["schemas"][
        "DecisionCreateRequestV1-Input"
    ]["properties"]
    assert "bounded_research" in examples
    assert {"evidence_catalogue", "research_policy", "research_brief"}.issubset(
        properties
    )


@pytest.mark.asyncio
async def test_research_refresh_returns_202_then_linked_201_and_idempotent_200(
    phase2_client,
):
    client, research = phase2_client
    payload = deepcopy(_ambiguous_research_payload())
    created = await client.post(
        "/api/orqaly-axwise/v1/orchestration/decisions",
        headers=_create_headers("phase2-api-parent"),
        json=payload,
    )

    assert created.status_code == 201
    parent = created.json()
    assert parent["routing_mode"] == "research_assisted"
    assert parent["status"] == "pending_research"
    decision_id = parent["decision_id"]

    pending = await client.post(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh",
        headers={**_tenant_headers(), "Idempotency-Key": "phase2-api-result"},
    )
    assert pending.status_code == 202
    assert pending.json()["decision_id"] == decision_id

    research.result = ResearchResultV1(
        job=ResearchJobV1.model_validate(parent["research_job"]).model_copy(
            update={"status": "completed", "evidence_count": 1}
        ),
        evidence=[
            EvidenceItemV1(
                reference_id="synthetic:api:1",
                provenance="synthetic",
                relevance=1.0,
                quality=1.0,
                verified=True,
                verification_source="axwise_audit",
                capability_hints=["discovered capability"],
            )
        ],
    )
    completed = await client.post(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh",
        headers={**_tenant_headers(), "Idempotency-Key": "phase2-api-result"},
    )
    retry = await client.post(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh",
        headers={**_tenant_headers(), "Idempotency-Key": "phase2-api-result"},
    )
    peer = await client.post(
        f"/api/orqaly-axwise/v1/orchestration/decisions/{decision_id}/research/refresh",
        headers={
            **_tenant_headers("orqaly-user-peer"),
            "Idempotency-Key": "phase2-peer",
        },
    )

    assert completed.status_code == 201
    assert completed.json()["parent_decision_id"] == decision_id
    assert completed.json()["routing_mode"] == "evidence_assisted"
    assert retry.status_code == 200
    assert retry.json()["decision_id"] == completed.json()["decision_id"]
    assert retry.json()["reused"] is True
    assert peer.status_code == 404
