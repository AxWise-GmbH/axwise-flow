"""Durable Phase 2 research start, resume, fallback, and rescoring tests."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.domain.orchestration.enums import RoutingMode
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
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
    PipelineRun,
    User,
)
from backend.services.orchestration.adapters.hybrid_research_adapter import (
    HybridResearchAdapter,
)
from backend.services.orchestration.decision_service import (
    DecisionLinkError,
    IdempotencyConflict,
    OrchestrationDecisionService,
)
from backend.services.orchestration.scope_contract_service import (
    ScopeContractError,
    scope_contract_binding,
)
from backend.services.orqaly_hybrid_run_service import HybridRunService
from backend.tests.orchestration.scope_acceptance_helpers import accept_scope
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
        assert request.scope_packet is not None
        return ResearchJobV1(
            job_id=f"research-{idempotency_key}",
            status="queued",
            decision_id=decision_id,
            scope_contract_binding=scope_contract_binding(request.scope_packet),
            scope_research_acceptance=request.scope_research_acceptance,
            scope_runtime_binding=request.scope_packet.runtime,
        )

    def collect(self, request, job):
        self.collect_calls += 1
        result = self.result or ResearchResultV1(job=job)
        return result.model_copy(
            update={
                "job": result.job.model_copy(
                    update={
                        "scope_contract_binding": job.scope_contract_binding,
                        "scope_research_acceptance": job.scope_research_acceptance,
                        "scope_runtime_binding": job.scope_runtime_binding,
                    }
                ),
                "scope_contract_binding": job.scope_contract_binding,
                "scope_research_acceptance": job.scope_research_acceptance,
                "scope_runtime_binding": job.scope_runtime_binding,
            }
        )


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
            PipelineRun.__table__,
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


def _approved_request(
    service: OrchestrationDecisionService,
    payload: dict | None,
    key: str,
) -> DecisionCreateRequestV1:
    proposal = service.create(
        _request(payload),
        "axwise-user",
        f"{key}-scope-proposal",
    )
    assert proposal.research_job is None
    assert proposal.research_execution_inputs_hash is not None
    return accept_scope(
        proposal.input_snapshot,
        proposal.decision_id,
        execution_inputs_hash=proposal.research_execution_inputs_hash,
    )


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


@pytest.mark.parametrize(
    "legacy_fields",
    [
        (
            "evidence_catalogue",
            "research_policy",
            "research_brief",
            "planning",
            "upstream_decision_id",
            "scope_state",
            "scope_packet",
            "scope_continuation",
        ),
        (
            "planning",
            "upstream_decision_id",
            "scope_state",
            "scope_packet",
            "scope_continuation",
        ),
        (
            "upstream_decision_id",
            "scope_state",
            "scope_packet",
            "scope_continuation",
        ),
        ("scope_state", "scope_packet", "scope_continuation"),
    ],
    ids=("phase1", "phase2", "pre-link", "pre-scope-contract"),
)
def test_non_normalized_legacy_idempotency_hash_is_rejected(
    decision_store,
    legacy_fields,
):
    service = OrchestrationDecisionService(SqlAlchemyDecisionStore(decision_store))
    request = _request()
    idempotency_key = "stale-" + "-".join(legacy_fields)
    created = service.create(request, "axwise-user", idempotency_key)
    row = (
        decision_store.query(OrchestrationDecisionSnapshot)
        .filter(OrchestrationDecisionSnapshot.decision_id == created.decision_id)
        .one()
    )
    legacy_payload = created.input_snapshot.model_dump(
        mode="json",
        by_alias=True,
        exclude_none=False,
    )
    for field in legacy_fields:
        legacy_payload.pop(field, None)
    legacy_json = json.dumps(legacy_payload, sort_keys=True, separators=(",", ":"))
    legacy_hash = hashlib.sha256(legacy_json.encode("utf-8")).hexdigest()
    assert legacy_hash != created.request_hash
    row.request_hash = legacy_hash
    snapshot = dict(row.input_snapshot)
    for field in legacy_fields:
        snapshot.pop(field, None)
    row.input_snapshot = snapshot
    decision_store.commit()

    with pytest.raises(IdempotencyConflict, match="different request"):
        service.create(request, "axwise-user", idempotency_key)
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 1


def test_unapproved_scope_is_admission_only_and_does_not_start_research(decision_store):
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
    assert record.research_job is None
    assert any(
        gate.gate_id == "gate-scope-confirmation"
        for gate in record.approval_points
    )
    assert record.recommended_agents == []
    assert record.execution_plan.nodes == []
    assert record.execution_plan.executable is False
    assert record.confidence == 0
    assert research.start_calls == 0
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 1


def test_approved_scope_starts_durable_research_without_assignment(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )

    record = service.create(
        _approved_request(
            service,
            _ambiguous_research_payload(),
            "approved-research-start",
        ),
        "axwise-user",
        "approved-research-start",
    )

    assert record.routing_mode.value == "research_assisted"
    assert record.status.value == "pending_research"
    assert record.research_job.status == "queued"
    assert record.recommended_agents == []
    assert research.start_calls == 1


def test_typed_research_contract_overrides_router_drift_before_and_after_acceptance(
    decision_store,
    monkeypatch,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    route = service.router.route

    def misclassified_direct(request, evidence):
        return route(request, evidence).model_copy(
            update={"selected_mode": RoutingMode.DIRECT}
        )

    monkeypatch.setattr(service.router, "route", misclassified_direct)
    proposal = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "router-drift-proposal",
    )

    assert proposal.scope_packet.research_contract.evidence.mode == "synthetic"
    assert proposal.routing_mode == RoutingMode.RESEARCH_ASSISTED
    assert proposal.research_job is None
    assert research.start_calls == 0

    accepted = accept_scope(
        proposal.input_snapshot,
        proposal.decision_id,
        execution_inputs_hash=proposal.research_execution_inputs_hash,
    )
    started = service.create(accepted, "axwise-user", "router-drift-start")

    assert started.routing_mode == RoutingMode.RESEARCH_ASSISTED
    assert started.research_job is not None
    assert research.start_calls == 1


def test_none_evidence_contract_cannot_be_upgraded_to_paid_research_by_router_drift(
    decision_store,
    monkeypatch,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    route = service.router.route

    def misclassified_research(request, evidence):
        return route(request, evidence).model_copy(
            update={"selected_mode": RoutingMode.RESEARCH_ASSISTED}
        )

    monkeypatch.setattr(service.router, "route", misclassified_research)
    record = service.create(_request(), "axwise-user", "none-router-drift")

    assert record.scope_packet.research_contract.evidence.mode == "none"
    assert record.routing_mode == RoutingMode.DIRECT
    assert record.research_job is None
    assert research.start_calls == 0


def test_one_acceptance_returns_one_decision_and_one_research_dispatch(
    decision_store,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    proposal = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "one-acceptance-proposal",
    )
    accepted = accept_scope(
        proposal.input_snapshot,
        proposal.decision_id,
        execution_inputs_hash=proposal.research_execution_inputs_hash,
    )

    first = service.create(accepted, "axwise-user", "network-attempt-a")
    second = service.create(accepted, "axwise-user", "network-attempt-b")

    assert second.reused is True
    assert second.decision_id == first.decision_id
    assert second.research_job == first.research_job
    assert research.start_calls == 1
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 2


def test_paid_run_and_accepted_decision_commit_atomically_and_retry_once(
    decision_store,
    monkeypatch,
):
    user = decision_store.query(User).filter_by(user_id="axwise-user").one()
    hybrid = HybridRunService(
        object(),
        session_factory=lambda: decision_store,
        atomic_session=decision_store,
    )
    adapter = HybridResearchAdapter(
        hybrid,
        user,
        "orqaly-org-example",
        "orqaly-user",
    )
    store = SqlAlchemyDecisionStore(decision_store)
    service = OrchestrationDecisionService(store, research_port=adapter)
    proposal = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "atomic-proposal",
    )
    accepted = accept_scope(
        proposal.input_snapshot,
        proposal.decision_id,
        execution_inputs_hash=proposal.research_execution_inputs_hash,
    )
    real_add = store.add

    def fail_decision_commit(_record):
        raise RuntimeError("forced decision persistence failure")

    monkeypatch.setattr(store, "add", fail_decision_commit)
    with pytest.raises(RuntimeError, match="forced decision persistence failure"):
        service.create(accepted, "axwise-user", "atomic-attempt-a")
    decision_store.rollback()

    assert decision_store.query(PipelineRun).count() == 0
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 1

    monkeypatch.setattr(store, "add", real_add)
    started = service.create(accepted, "axwise-user", "atomic-attempt-b")

    runs = decision_store.query(PipelineRun).all()
    assert len(runs) == 1
    assert runs[0].request_id == started.decision_id
    assert started.research_job.job_id == runs[0].job_id
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 2


def test_accepted_execution_ignores_reconstructed_mutable_provider_inputs(
    decision_store,
):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    proposal = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "immutable-proposal-inputs",
    )
    accepted = accept_scope(
        proposal.input_snapshot,
        proposal.decision_id,
        execution_inputs_hash=proposal.research_execution_inputs_hash,
    )
    altered_task = accepted.task.model_copy(
        update={
            "domain": "rebuilt_orqaly_domain",
            "objective": "A reconstructed objective must not replace the proposal",
            "required_capabilities": ["new mutable capability"],
            "requested_actions": ["new mutable action"],
        }
    )
    altered_brief = accepted.research_brief.model_copy(
        update={
            "industry": "mutable accepted-body industry",
            "research_questions": ["A newly injected question?"],
        }
    )
    altered_evidence = [
        EvidenceItemV1(
            reference_id="mutable:accepted-body",
            provenance="inferred",
            relevance=1.0,
            quality=1.0,
        )
    ]
    reconstructed = accepted.model_copy(
        update={
            "task": altered_task,
            "research_brief": altered_brief,
            "evidence_catalogue": altered_evidence,
            "available_agents": [],
        }
    )

    started = service.create(
        reconstructed,
        "axwise-user",
        "immutable-accepted-inputs",
    )

    assert started.input_snapshot.task == proposal.input_snapshot.task
    assert started.input_snapshot.research_brief == proposal.input_snapshot.research_brief
    assert (
        started.input_snapshot.evidence_catalogue
        == proposal.input_snapshot.evidence_catalogue
    )
    assert started.input_snapshot.available_agents == proposal.input_snapshot.available_agents
    assert (
        started.research_execution_inputs_hash
        == proposal.research_execution_inputs_hash
        == accepted.scope_research_acceptance.execution_inputs_hash
    )


def test_acceptance_cannot_be_rebound_to_another_proposal_or_scope(
    decision_store,
):
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=FakeResearchPort(),
    )
    first = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "bound-proposal-one",
    )
    second = service.create(
        _request(_ambiguous_research_payload()),
        "axwise-user",
        "bound-proposal-two",
    )
    accepted = accept_scope(
        first.input_snapshot,
        first.decision_id,
        execution_inputs_hash=first.research_execution_inputs_hash,
    )

    with pytest.raises(ScopeContractError, match="owner envelope"):
        service.create(
            accepted.model_copy(update={"upstream_decision_id": second.decision_id}),
            "axwise-user",
            "wrong-proposal",
        )

    tampered_acceptance = accepted.scope_research_acceptance.model_copy(
        update={"scope_hash": "0" * 64}
    )
    with pytest.raises(DecisionLinkError, match="exact admission-only proposal"):
        service.create(
            accepted.model_copy(
                update={"scope_research_acceptance": tampered_acceptance}
            ),
            "axwise-user",
            "tampered-scope",
        )


def test_completed_research_creates_linked_immutable_rescore(decision_store):
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _approved_request(
            service,
            _ambiguous_research_payload(),
            "research-rescore-parent",
        ),
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
    assert decision_store.query(OrchestrationDecisionSnapshot).count() == 3
    assert decision_store.query(OrchestrationEvent).count() == 3


def test_completed_research_preserves_accepted_scope_and_keeps_facts_in_result(
    decision_store,
):
    payload = _ambiguous_research_payload()
    payload["scope_state"] = {
        "assumptions": [
            {
                "text": "Mobile usage is the dominant workflow.",
                "materiality": "material",
                "owner_confirmed": True,
                "truth_status": "assumption",
                "source_refs": ["owner-confirmation"],
            }
        ]
    }
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _approved_request(service, payload, "research-scope-parent"),
        "axwise-user",
        "research-scope-parent",
    )
    excerpt = "The official 2026 scheduling-gap count is 42."
    verified_fact = {
        "claim": "Official clinic statistics reports 42 scheduling gaps in 2026.",
        "verification": "verified",
        "source_refs": ["axwise-research-fact-authoritative"],
        "source_authority_ids": ["axwise-authority-official-clinic"],
        "verbatim_excerpt": excerpt,
        "content_hash": hashlib.sha256(excerpt.encode("utf-8")).hexdigest(),
    }
    research.result = ResearchResultV1.model_validate(
        {
            "job": parent.research_job.model_copy(
                update={"status": "completed", "evidence_count": 2}
            ),
            "evidence": [
                {
                    "reference_id": "axwise-research-fact-authoritative",
                    "provenance": "empirical",
                    "content_hash": verified_fact["content_hash"],
                    "relevance": 1,
                    "quality": 1,
                    "verified": True,
                    "verification_source": "axwise_audit",
                    "classification": "public",
                },
                {
                    "reference_id": "owner-confirmation",
                    "provenance": "operational",
                    "relevance": 1,
                    "quality": 1,
                    "verified": False,
                    "verification_source": "none",
                },
            ],
            "scope_facts": [
                verified_fact,
                {
                    "claim": "Mobile usage is the dominant workflow.",
                    "verification": "verified",
                    "source_refs": ["owner-confirmation"],
                    "source_authority_ids": ["forged-owner-authority"],
                    "verbatim_excerpt": "Mobile usage is the dominant workflow.",
                    "content_hash": hashlib.sha256(
                        b"Mobile usage is the dominant workflow."
                    ).hexdigest(),
                },
                {
                    "claim": "A detached research claim must not enter the scope.",
                    "verification": "verified",
                    "source_refs": ["missing-evidence-reference"],
                    "source_authority_ids": ["forged-detached-authority"],
                    "verbatim_excerpt": "Detached claim",
                    "content_hash": hashlib.sha256(b"Detached claim").hexdigest(),
                },
            ],
        }
    )

    record = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "research-scope-child",
    ).record

    assert record.parent_decision_id == parent.decision_id
    assert parent.scope_packet.ledger.facts == []
    assert record.scope_packet == parent.scope_packet
    assert record.input_snapshot.scope_state.facts == []
    assert record.scope_packet.ledger.facts == []
    assert record.scope_contract_binding == parent.scope_contract_binding
    assert record.scope_research_acceptance == parent.scope_research_acceptance
    assert (
        record.research_execution_inputs_hash
        == parent.research_execution_inputs_hash
    )
    assert [item.text for item in record.scope_packet.ledger.assumptions] == [
        "Mobile usage is the dominant workflow."
    ]


def test_post_research_capabilities_improve_ranking_without_authorizing_execution(
    decision_store,
):
    payload = _ambiguous_research_payload()
    payload["research_policy"]["minimum_evidence_sufficiency"] = 0.95
    payload["available_agents"] = [
        {
            **payload["available_agents"][0],
            "agent_id": "agent-general",
            "name": "General Operations Agent",
            "capabilities": ["core operation"],
        },
        {
            **payload["available_agents"][0],
            "agent_id": "agent-discovered",
            "name": "Discovered Specialist",
            "capabilities": ["core operation", "discovered capability"],
        },
    ]
    research = FakeResearchPort()
    service = OrchestrationDecisionService(
        SqlAlchemyDecisionStore(decision_store),
        research_port=research,
    )
    parent = service.create(
        _approved_request(service, payload, "research-soft-capability-parent"),
        "axwise-user",
        "research-soft-capability-parent",
    )
    research.result = ResearchResultV1(
        job=parent.research_job.model_copy(
            update={"status": "completed", "evidence_count": 1}
        ),
        evidence=[
            EvidenceItemV1(
                reference_id="synthetic:capability:1",
                provenance="synthetic",
                relevance=1.0,
                quality=1.0,
                verified=True,
                verification_source="axwise_audit",
                capability_hints=["discovered capability"],
            )
        ],
    )

    record = service.refresh_research(
        parent.decision_id,
        "orqaly-org-example",
        "orqaly-user",
        "axwise-user",
        "research-soft-capability-result",
    ).record

    assert record.routing_mode.value == "human_clarification"
    assert record.recommended_agents == []
    assert record.execution_plan.executable is False
    assert record.candidate_rankings[0].agent_id == "agent-discovered"
    assert "discovered_capability" in record.input_snapshot.task.preferred_capabilities


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
        _approved_request(service, payload, "bounded-merge-parent"),
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
        _approved_request(service, _ambiguous_research_payload(), "partial-parent"),
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
        _approved_request(
            service,
            _ambiguous_research_payload(),
            f"failure-parent-{terminal_status}",
        ),
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
