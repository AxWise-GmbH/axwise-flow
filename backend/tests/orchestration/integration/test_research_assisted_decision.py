"""Durable Phase 2 research start, resume, fallback, and rescoring tests."""

from __future__ import annotations

from copy import deepcopy

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    EvidenceItemV1,
    PlanningRequirementsV1,
    ResearchJobV1,
    ResearchResultV1,
)
from backend.infrastructure.persistence.orchestration_repositories import (
    SqlAlchemyDecisionStore,
)
from backend.models import OrchestrationDecisionSnapshot, OrchestrationEvent, User
from backend.services.orchestration.decision_service import (
    IdempotencyConflict,
    OrchestrationDecisionService,
)
from backend.tests.orchestration.unit.test_uncertainty_router import (
    _ambiguous_research_payload,
    _payload,
)


pytestmark = [pytest.mark.contract, pytest.mark.integration]


class FakeResearchPort:
    def __init__(self, result: ResearchResultV1 | None = None):
        self.start_calls = 0
        self.collect_calls = 0
        self.result = result

    def start(self, request, decision_id, idempotency_key):
        self.start_calls += 1
        return ResearchJobV1(
            job_id=f"research-{idempotency_key}",
            status="queued",
            decision_id=decision_id,
        )

    def collect(self, request, job):
        self.collect_calls += 1
        return self.result or ResearchResultV1(job=job)


class FakeEvidencePort:
    def __init__(self, evidence: list[EvidenceItemV1]):
        self.evidence = evidence

    def retrieve(self, request, user_id):
        return self.evidence


@pytest.fixture
def decision_store(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/phase2.db")
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
    session.add(User(user_id="axwise-user", email="phase2@example.com", usage_data={}))
    session.commit()
    yield session
    session.close()
    engine.dispose()


def _request(payload: dict | None = None) -> DecisionCreateRequestV1:
    value = deepcopy(payload or _payload())
    value["tenant"] = {"userId": "orqaly-user", "orgId": "orqaly-org-example"}
    return DecisionCreateRequestV1.model_validate(value)


def test_clear_direct_task_never_invokes_research_adapter(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )

    record = service.create(_request(), "axwise-user", "direct-no-research")

    assert record.routing_mode.value == "direct"
    assert record.recommended_agents
    assert research.start_calls == 0


def test_resolved_evidence_is_preserved_in_the_immutable_input_snapshot(
    decision_store,
):
    resolved = EvidenceItemV1(
        reference_id="analysis:resolved:1",
        provenance="operational",
        content_hash="resolved-evidence-hash",
        relevance=1.0,
        quality=1.0,
        verified=True,
        verification_source="orqaly_asserted",
        capability_hints=["discovered capability"],
    )
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        evidence_port=FakeEvidencePort([resolved]),
    )

    record = service.create(_request(), "axwise-user", "resolved-evidence")

    assert record.routing_mode.value == "evidence_assisted"
    assert record.input_snapshot.evidence_catalogue == [resolved]
    assert record.evidence[0].reference_id == resolved.reference_id
    row = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == record.decision_id)
        .one()
    )
    assert row.input_snapshot["evidence_catalogue"][0]["reference_id"] == (
        resolved.reference_id
    )


def test_phase1_idempotency_hash_remains_compatible_only_for_default_phase2_fields(
    decision_store,
):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    request = _request()
    created = service.create(request, "axwise-user", "legacy-phase1-hash")
    row = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == created.decision_id)
        .one()
    )
    row.request_hash = service._legacy_phase1_request_hash(request)
    snapshot = dict(row.input_snapshot)
    snapshot.pop("evidence_catalogue")
    snapshot.pop("research_policy")
    snapshot.pop("research_brief")
    row.input_snapshot = snapshot
    decision_store.commit()

    retry = service.create(request, "axwise-user", "legacy-phase1-hash")
    changed_payload = _ambiguous_research_payload()
    changed_request = _request(changed_payload)

    assert retry.reused is True
    assert retry.decision_id == created.decision_id
    with pytest.raises(IdempotencyConflict):
        service.create(
            changed_request,
            "axwise-user",
            "legacy-phase1-hash",
        )


def test_phase2_idempotency_hash_remains_compatible_until_planning_changes(
    decision_store,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    request = _request(_ambiguous_research_payload())
    created = service.create(request, "axwise-user", "legacy-phase2-hash")
    row = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == created.decision_id)
        .one()
    )
    row.request_hash = service._legacy_phase2_request_hash(request)
    snapshot = dict(row.input_snapshot)
    snapshot.pop("planning")
    row.input_snapshot = snapshot
    decision_store.commit()

    retry = service.create(request, "axwise-user", "legacy-phase2-hash")
    planning = {
        "pattern": "single",
        "steps": [
            {
                "step_id": "planned-step",
                "title": "Execute the planned step",
                "objective": "Execute the explicitly contracted planned step",
                "required_capabilities": ["core operation"],
                "required_tools": ["records_read"],
                "requested_actions": ["analyze_records"],
                "input_contract": {"task": "TaskEnvelopeV1"},
                "output_contract": {"result": "ResultV1"},
                "completion_criteria": ["The requested result is complete"],
            }
        ],
    }
    changed = request.model_copy(
        update={"planning": PlanningRequirementsV1.model_validate(planning)}
    )

    assert retry.reused is True
    assert retry.decision_id == created.decision_id
    with pytest.raises(IdempotencyConflict):
        service.create(changed, "axwise-user", "legacy-phase2-hash")


def test_pre_link_idempotency_hash_remains_compatible_without_an_upstream_parent(
    decision_store,
):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    request = _request()
    created = service.create(request, "axwise-user", "legacy-pre-link-hash")
    row = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == created.decision_id)
        .one()
    )
    row.request_hash = service._legacy_pre_link_request_hash(request)
    snapshot = dict(row.input_snapshot)
    snapshot.pop("upstream_decision_id")
    row.input_snapshot = snapshot
    decision_store.commit()

    retry = service.create(request, "axwise-user", "legacy-pre-link-hash")

    assert retry.reused is True
    assert retry.decision_id == created.decision_id
    with pytest.raises(IdempotencyConflict):
        service.create(
            request.model_copy(update={"upstream_decision_id": "decision-new-parent"}),
            "axwise-user",
            "legacy-pre-link-hash",
        )


def test_research_is_durable_pending_and_does_not_publish_an_assignment(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )

    record = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "research-start",
    )

    assert record.routing_mode.value == "research_assisted"
    assert record.status.value == "pending_research"
    assert record.research_job.status == "queued"
    assert record.recommended_agents == []
    assert record.execution_plan.nodes == []
    assert record.execution_plan.executable is False
    assert record.confidence == 0
    assert research.start_calls == 1
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 1


def test_completed_research_creates_linked_immutable_rescore(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "research-rescore-parent",
    )
    research.result = ResearchResultV1(
        job=parent.research_job.model_copy(
            update={"status": "completed", "evidence_count": 1}
        ),
        evidence=[
            EvidenceItemV1(
                reference_id="synthetic:research:1",
                provenance="synthetic",
                relevance=1.0,
                quality=1.0,
                verified=True,
                verification_source="axwise_audit",
                capability_hints=["discovered capability"],
            )
        ],
    )

    refreshed = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "research-rescore-result",
    )

    record = refreshed.record
    assert refreshed.pending is False
    assert record.parent_decision_id == parent.decision_id
    assert record.decision_id != parent.decision_id
    assert record.routing_mode.value == "evidence_assisted"
    assert record.recommended_agents[0].agent_id == "agent-a"
    assert record.evidence[0].provenance == "synthetic"
    assert record.ranking_changes
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 2
    assert decision_store.query(OrchestrationEvent).count() == 2


def test_refresh_caps_the_combined_existing_and_research_evidence(decision_store):
    payload = _ambiguous_research_payload()
    payload["research_policy"]["maximum_evidence_items"] = 2
    payload["evidence_catalogue"] = [
        {
            "reference_id": f"existing:weak:{index}",
            "provenance": "inferred",
            "relevance": 0.1,
            "quality": 0.1,
        }
        for index in range(2)
    ]
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _request(payload),
        "axwise-user",
        "bounded-merge-parent",
    )
    research.result = ResearchResultV1(
        job=parent.research_job.model_copy(
            update={"status": "completed", "evidence_count": 2}
        ),
        evidence=[
            EvidenceItemV1(
                reference_id=f"synthetic:strong:{index}",
                provenance="synthetic",
                relevance=1.0,
                quality=1.0,
                verified=True,
                verification_source="axwise_audit",
            )
            for index in range(2)
        ],
    )

    refreshed = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "bounded-merge-result",
    ).record

    assert len(refreshed.input_snapshot.evidence_catalogue) == 2
    assert {item.reference_id for item in refreshed.input_snapshot.evidence_catalogue} == {
        "synthetic:strong:0",
        "synthetic:strong:1",
    }


def test_partial_research_can_only_route_with_explicit_usable_evidence(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "partial-parent",
    )
    research.result = ResearchResultV1(
        job=parent.research_job.model_copy(
            update={
                "status": "partial",
                "evidence_count": 1,
                "failure_reason": "one stakeholder timed out",
            }
        ),
        evidence=[
            EvidenceItemV1(
                reference_id="synthetic:partial:1",
                provenance="synthetic",
                relevance=1.0,
                quality=1.0,
                verified=True,
                verification_source="axwise_audit",
                capability_hints=["discovered capability"],
            )
        ],
    )

    refreshed = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "partial-result",
    ).record

    assert refreshed.routing_mode.value == "evidence_assisted"
    assert "research returned partial evidence" in refreshed.routing_assessment.reasons
    assert refreshed.research_job.status == "partial"


@pytest.mark.parametrize(
    "terminal_status",
    ["timed_out", "cancelled", "no_result", "low_quality", "failed"],
)
def test_failed_or_insufficient_research_cannot_become_confident_assignment(
    decision_store,
    terminal_status,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        f"failure-parent-{terminal_status}",
    )
    research.result = ResearchResultV1(
        job=parent.research_job.model_copy(
            update={
                "status": terminal_status,
                "failure_reason": f"fixture {terminal_status}",
            }
        )
    )

    refreshed = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        f"failure-result-{terminal_status}",
    ).record

    assert refreshed.routing_mode.value == "human_clarification"
    assert refreshed.status.value == "escalated"
    assert refreshed.recommended_agents == []
    assert refreshed.confidence == 0
    assert refreshed.execution_plan.nodes == []
    assert terminal_status in refreshed.routing_assessment.reasons[-1]
