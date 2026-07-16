import asyncio
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    DemographicDetails,
    InterviewResponse,
    QuestionsData,
    SimulatedInterview,
    SimulatedPerson,
    SimulationConfig,
    SimulationRequest,
    SimulationResponse,
    Stakeholder,
)
from backend.database import Base
from backend.models import AnalysisResult, PipelineRun, SimulationData, User
from backend.services.orqaly_hybrid_run_service import HybridOutputs, HybridRunService
from backend.services.orqaly_persona_resolution_service import (
    OrqalyAgentCandidate,
    OrqalyTaskContext,
)

pytestmark = pytest.mark.contract


@compiles(JSONB, "sqlite")
def _compile_jsonb_as_json(_type, _compiler, **_kwargs):
    """The production model uses JSONB; this isolated test database is SQLite."""
    return "JSON"


def _request(problem: str = "Research plans are vague") -> SimulationRequest:
    return SimulationRequest(
        business_context=BusinessContext(
            business_idea="Evidence-grounded event research",
            target_customer="Research leaders",
            problem=problem,
            industry="research technology",
            location="Warsaw",
        ),
        questions_data=QuestionsData(
            stakeholders={
                "research": [
                    Stakeholder(
                        id="lead",
                        name="Research Lead",
                        description="Owns research quality",
                        questions=["What evidence do you need?"],
                    )
                ]
            }
        ),
        config=SimulationConfig(people_per_stakeholder=1),
    )


class FakeOrchestrator:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.finalized = []
        self.finalize_flags = []

    async def simulate_with_persistence(
        self, request, user_id, simulation_id=None, finalize=True
    ):
        self.finalize_flags.append(finalize)
        person = SimulatedPerson(
            id="person-1",
            name="Alex Researcher",
            age=36,
            background="Leads research operations.",
            motivations=["Trust evidence"],
            pain_points=["Vague plans"],
            communication_style="direct",
            stakeholder_type="research",
            demographic_details=DemographicDetails(),
        )
        interview = SimulatedInterview(
            person_id=person.id,
            stakeholder_type="research",
            responses=[
                InterviewResponse(
                    question="What evidence do you need?",
                    response="I need traceable quotes before I commit event budget.",
                    sentiment="neutral",
                    key_insights=["Traceable evidence is mandatory"],
                )
            ],
            interview_duration_minutes=5,
            overall_sentiment="neutral",
            key_themes=["traceability"],
        )
        simulation_id = simulation_id or "sim-hybrid-test"
        session = self.session_factory()
        try:
            session.add(
                SimulationData(
                    simulation_id=simulation_id,
                    user_id=user_id,
                    status="running",
                    created_at=datetime.utcnow(),
                    business_context=request.business_context.model_dump(),
                    questions_data=request.questions_data.model_dump(),
                    simulation_config=request.config.model_dump(),
                    personas=[person.model_dump()],
                    interviews=[interview.model_dump()],
                )
            )
            session.commit()
        finally:
            session.close()
        return SimulationResponse(
            success=True,
            message="Pipeline B source material ready",
            simulation_id=simulation_id,
            people=[person],
            interviews=[interview],
            recommendations=["Use traceable evidence"],
        )

    async def finalize_hybrid_simulation(self, result):
        self.finalized.append(result.simulation_id)


async def fake_enrichment(result, request):
    quote = "I need traceable quotes before I commit event budget."
    result.empirical_personas = [
        {
            "name": "Alex Researcher",
            "_evidence_linking_v2": {
                "evidence_map": {
                    "goals_and_motivations": [
                        {
                            "quote": quote,
                            "start_char": 0,
                            "end_char": len(quote),
                            "speaker": "Alex Researcher",
                            "document_id": f"sim_session_{result.simulation_id}_person-1",
                        }
                    ]
                }
            },
        }
    ]
    result.metadata = {
        "hybrid_status": "completed",
        "audited_evidence_count": 1,
        "evidence_document_ids": [f"sim_session_{result.simulation_id}_person-1"],
    }
    return result


@pytest.fixture
def session_factory(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/hybrid.db")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    session = factory()
    session.add(
        User(
            user_id="axwise-user-1",
            email="owner@example.com",
            first_name="Owner",
            last_name="User",
            usage_data={},
        )
    )
    session.commit()
    session.close()
    return factory


def test_enqueue_is_tenant_scoped_and_idempotent(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(orchestrator, session_factory, fake_enrichment)
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()

    first, reused = service.enqueue(
        _request(),
        HybridOutputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-1",
        "trace-1",
    )
    second, reused_second = service.enqueue(
        _request(),
        HybridOutputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-1",
        "trace-2",
    )

    assert reused is False
    assert reused_second is True
    assert first.job_id == second.job_id
    with pytest.raises(ValueError, match="different request"):
        service.enqueue(
            _request("A materially different request"),
            HybridOutputs(),
            user,
            "orqaly-org-1",
            "orqaly-user-1",
            "idem-1",
            "trace-3",
        )
    with pytest.raises(ValueError, match="different request"):
        service.enqueue(
            _request(),
            HybridOutputs(),
            user,
            "orqaly-org-1",
            "orqaly-user-peer",
            "idem-1",
            "trace-peer",
        )


@pytest.mark.asyncio
async def test_worker_publishes_only_after_hybrid_result_is_persisted(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(orchestrator, session_factory, fake_enrichment)
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        HybridOutputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-2",
        "trace-4",
    )

    claimed_id = await service.process_next()
    assert claimed_id == run.job_id
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(run.job_id, "axwise-user-1", "orqaly-org-1")
    assert persisted.status == "completed"
    assert persisted.progress_percentage == 100
    assert persisted.current_stage == "completed"
    assert persisted.dataset["empirical_personas"][0]["name"] == "Alex Researcher"
    assert persisted.result_summary["evidence_item_count"] == 1
    assert persisted.analysis_id
    assert orchestrator.finalize_flags == [False]
    assert orchestrator.finalized == [persisted.simulation_id]

    session = session_factory()
    simulation = session.query(SimulationData).filter_by(simulation_id=persisted.simulation_id).first()
    analysis = session.query(AnalysisResult).filter_by(result_id=int(persisted.analysis_id)).first()
    session.close()
    assert simulation.status == "completed"
    assert simulation.empirical_personas[0]["name"] == "Alex Researcher"
    assert analysis.status == "completed"

    assert service.get_run_for_tenant(run.job_id, "axwise-user-1", "other-org") is None


@pytest.mark.asyncio
async def test_worker_persists_customer_and_execution_persona_resolution(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(orchestrator, session_factory, fake_enrichment)
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        HybridOutputs(persona_resolution=True),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-personas",
        "trace-personas",
        task_context=OrqalyTaskContext(
            task_id="task-1",
            title="Prepare evidence-grounded event plan",
            description="Review customer interviews and event risks",
        ),
        agent_candidates=[
            OrqalyAgentCandidate(
                agent_id="agent-research",
                name="Research Lead",
                role="Customer Research Strategist",
                capabilities=["customer interviews", "event research", "evidence"],
                tools=["document-analysis"],
                success_rate=0.9,
            )
        ],
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)
    persisted = service.get_run_for_tenant(run.job_id, "axwise-user-1", "orqaly-org-1")
    resolution = persisted.dataset["data"]["persona_resolution"]
    assert resolution["customer_persona"]["name"] == "Alex Researcher"
    assert resolution["recommended_agent"]["agent_id"] == "agent-research"
    assert persisted.result_summary["persona_resolution_status"] == "matched_candidate"
    assert persisted.result_summary["recommended_agent_id"] == "agent-research"
