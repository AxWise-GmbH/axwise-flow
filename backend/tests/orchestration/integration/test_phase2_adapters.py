"""Contract tests for existing-evidence and durable A+B orchestration adapters."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.domain.orchestration.models import (
    ContextReference,
    DecisionCreateRequestV1,
)
from backend.models import AnalysisResult, InterviewData, User
from backend.services.orchestration.adapters.evidence_adapter import (
    SqlAlchemyEvidenceAdapter,
)
from backend.services.orchestration.adapters.hybrid_research_adapter import (
    HybridResearchAdapter,
)
from backend.tests.orchestration.unit.test_uncertainty_router import (
    _ambiguous_research_payload,
)


pytestmark = [pytest.mark.contract, pytest.mark.integration]


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs):
    return "JSON"


class FakeHybridService:
    def __init__(self, run=None):
        self.run = run
        self.enqueue_kwargs = None
        self.cancel_calls = []

    def enqueue(self, **kwargs):
        self.enqueue_kwargs = kwargs
        run = SimpleNamespace(job_id="hybrid-adapter", status="queued")
        return run, False

    def get_run_for_tenant(self, *args):
        return self.run

    def cancel_for_tenant(self, *args):
        self.cancel_calls.append(args)
        return self.run


def _request() -> DecisionCreateRequestV1:
    return DecisionCreateRequestV1.model_validate(_ambiguous_research_payload())


def _adapter(service: FakeHybridService) -> HybridResearchAdapter:
    return HybridResearchAdapter(
        service,
        SimpleNamespace(user_id="axwise-user"),
        "orqaly-org-example",
        "orqaly-user-example",
    )


def _run(status: str, **updates):
    values = {
        "status": status,
        "created_at": datetime.now(timezone.utc),
        "dataset": {},
        "result_summary": {},
        "simulation_id": "simulation-1",
        "analysis_id": None,
        "error": None,
        "warning": None,
    }
    values.update(updates)
    return SimpleNamespace(**values)


def _research_job(adapter: HybridResearchAdapter):
    return adapter.start(_request(), "decision-1", "decision-key")


def test_hybrid_start_passes_decision_and_tenant_correlation():
    service = FakeHybridService()
    adapter = _adapter(service)

    job = _research_job(adapter)

    assert job.status == "queued"
    assert job.decision_id == "decision-1"
    assert service.enqueue_kwargs["request_id"] == "decision-1"
    assert service.enqueue_kwargs["external_org_id"] == "orqaly-org-example"
    assert service.enqueue_kwargs["external_user_id"] == "orqaly-user-example"
    assert service.enqueue_kwargs["idempotency_key"] == (
        "orchestration-research:decision-key"
    )
    outputs = service.enqueue_kwargs["outputs"]
    assert outputs.prd.enabled is False
    assert outputs.prd.required is False
    assert outputs.research_bundle is True
    assert service.enqueue_kwargs["research_mode"].value == "synthetic_only"
    assert service.enqueue_kwargs["grounding_policy"].required is False
    simulation = service.enqueue_kwargs["request"]
    assert simulation.config.performance_profile.value == "quality_fast"
    assert simulation.questions_data is not None
    assert set(simulation.questions_data.stakeholders) == {"primary", "secondary"}
    assert {
        stakeholder.id
        for group in simulation.questions_data.stakeholders.values()
        for stakeholder in group
    } == {
        "problem_experiencer",
        "decision_authority",
        "beneficiary",
        "executor",
        "outcome_definer",
    }


def test_hybrid_start_maps_explicit_grounded_bundle_contract_and_required_prd():
    payload = _ambiguous_research_payload()
    payload["research_brief"]["location"] = "Bremen"
    payload["research_brief"]["required_execution_roles"] = [
        "Marketing ICP Specialist",
        "Finance Pricing Specialist",
        "GDPR Legal Compliance Specialist",
        "Business Development Sales Specialist",
        "Commercial Risk Analyst",
    ]
    payload["research_policy"].update(
        {
            "required": True,
            "minimum_mode": "grounded_fast",
            "grounding_required": True,
            "fail_closed": True,
            "performance_profile": "quality_fast",
            "required_outputs": [
                "market_sources",
                "market_claims",
                "synthetic_participants",
                "interviews",
                "customer_personas",
                "persona_resolution",
                "research_prd",
                "research_bundle",
            ],
            "allowed_source_types": ["company_registry"],
        }
    )
    request = DecisionCreateRequestV1.model_validate(payload)
    service = FakeHybridService()
    adapter = _adapter(service)

    adapter.start(request, "decision-grounded", "grounded-key")

    assert service.enqueue_kwargs["research_mode"].value == "grounded_hybrid"
    grounding = service.enqueue_kwargs["grounding_policy"]
    assert grounding.required is True
    assert grounding.source_strategy == "registry"
    assert grounding.allowed_source_types == ["company_registry"]
    outputs = service.enqueue_kwargs["outputs"]
    assert outputs.prd.enabled is True
    assert outputs.prd.required is True
    assert outputs.prd.type == "operational"
    assert service.enqueue_kwargs["request"].config.performance_profile.value == (
        "quality_fast"
    )
    assert service.enqueue_kwargs["task_context"].required_execution_roles == (
        payload["research_brief"]["required_execution_roles"]
    )


def test_grounded_research_contract_requires_an_explicit_location():
    payload = _ambiguous_research_payload()
    payload["research_policy"].update(
        {
            "minimum_mode": "grounded_fast",
            "grounding_required": True,
            "fail_closed": True,
        }
    )

    with pytest.raises(ValueError, match="research_brief.location"):
        DecisionCreateRequestV1.model_validate(payload)


def test_hybrid_timeout_cancels_the_bounded_run():
    run = _run(
        "running",
        created_at=datetime.now(timezone.utc) - timedelta(minutes=20),
    )
    service = FakeHybridService(run)
    adapter = _adapter(service)
    job = _research_job(adapter)

    result = adapter.collect(_request(), job)

    assert result.job.status == "timed_out"
    assert service.cancel_calls


@pytest.mark.parametrize(
    ("run", "expected"),
    [
        (_run("cancelled", error="operator cancelled"), "cancelled"),
        (_run("failed", error="pipeline failed"), "failed"),
        (_run("completed"), "no_result"),
    ],
)
def test_hybrid_terminal_failure_and_empty_result_mapping(run, expected):
    adapter = _adapter(FakeHybridService(run))
    job = _research_job(adapter)

    result = adapter.collect(_request(), job)

    assert result.job.status == expected
    assert result.evidence == []


def _dataset_with_audited_quote():
    return {
        "empirical_personas": [
            {
                "evidence": [
                    {
                        "quote": "Audited synthetic stakeholder evidence",
                        "document_id": "simulation-transcript",
                        "start_char": 10,
                        "end_char": 48,
                    }
                ]
            }
        ]
    }


def test_hybrid_warning_is_partial_and_preserves_synthetic_provenance():
    run = _run(
        "completed_with_warnings",
        dataset=_dataset_with_audited_quote(),
        warning="one stakeholder timed out",
    )
    adapter = _adapter(FakeHybridService(run))
    job = _research_job(adapter)

    result = adapter.collect(_request(), job)

    assert result.job.status == "partial"
    assert result.evidence[0].provenance == "synthetic"
    assert result.evidence[0].verified is True


def test_hybrid_quality_threshold_rejects_weak_result():
    payload = _ambiguous_research_payload()
    payload["research_policy"]["minimum_evidence_quality"] = 0.9
    request = DecisionCreateRequestV1.model_validate(payload)
    run = _run("completed", dataset=_dataset_with_audited_quote())
    adapter = _adapter(FakeHybridService(run))
    job = adapter.start(request, "decision-quality", "quality-key")

    result = adapter.collect(request, job)

    assert result.job.status == "low_quality"
    assert result.evidence


def test_hybrid_evidence_expansion_respects_item_limit():
    payload = _ambiguous_research_payload()
    payload["research_policy"]["maximum_evidence_items"] = 1
    request = DecisionCreateRequestV1.model_validate(payload)
    dataset = _dataset_with_audited_quote()
    dataset["empirical_personas"].append(
        {
            "evidence": [
                {
                    "quote": "A second audited item beyond the configured limit",
                    "document_id": "simulation-transcript-2",
                    "start_char": 0,
                    "end_char": 49,
                }
            ]
        }
    )
    adapter = _adapter(FakeHybridService(_run("completed", dataset=dataset)))
    job = adapter.start(request, "decision-limit", "limit-key")

    result = adapter.collect(request, job)

    assert result.job.status == "completed"
    assert len(result.evidence) == 1


def test_existing_evidence_adapter_enforces_workspace_ownership(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/evidence.db")
    Base.metadata.create_all(
        engine,
        tables=[User.__table__, InterviewData.__table__, AnalysisResult.__table__],
    )
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add_all(
        [
            User(user_id="axwise-user", email="owner@example.com", usage_data={}),
            User(user_id="other-user", email="other@example.com", usage_data={}),
        ]
    )
    session.flush()
    owner_interview = InterviewData(
        user_id="axwise-user",
        filename="owner.txt",
        input_type="text",
        original_data="Operational records require a discovered capability.",
    )
    other_interview = InterviewData(
        user_id="other-user",
        filename="other.txt",
        input_type="text",
        original_data="Private evidence from another workspace.",
    )
    session.add_all([owner_interview, other_interview])
    session.flush()
    owner_result = AnalysisResult(
        data_id=owner_interview.id,
        status="completed",
        results={
            "source_type": "real_interview",
            "confidence_score": 0.8,
            "persona_resolution": {
                "ideal_agent_persona": {
                    "required_capabilities": ["discovered capability"]
                }
            },
        },
    )
    other_result = AnalysisResult(
        data_id=other_interview.id,
        status="completed",
        results={"source_type": "real_interview", "confidence_score": 0.9},
    )
    session.add_all([owner_result, other_result])
    session.commit()

    request = _request()
    request = request.model_copy(
        update={
            "task": request.task.model_copy(
                update={
                    "context_references": [
                        ContextReference(
                            reference_id=f"analysis:{owner_result.result_id}",
                            kind="analysis_result",
                        ),
                        ContextReference(
                            reference_id=f"analysis:{other_result.result_id}",
                            kind="analysis_result",
                        ),
                    ]
                }
            )
        }
    )

    evidence = SqlAlchemyEvidenceAdapter(session).retrieve(request, "axwise-user")

    assert [item.reference_id for item in evidence] == [
        f"analysis:{owner_result.result_id}"
    ]
    assert evidence[0].provenance == "empirical"
    assert evidence[0].capability_hints == ["discovered capability"]
    session.close()
    engine.dispose()
