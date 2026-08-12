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
    PersonaPattern,
    QuestionsData,
    SimulatedInterview,
    SimulatedPerson,
    SimulationConfig,
    SimulationPerformanceProfile,
    SimulationRequest,
    SimulationResponse,
    Stakeholder,
)
from backend.database import Base
from backend.models import AnalysisResult, PipelineRun, SimulationData, User
from backend.services.orqaly_hybrid_run_service import (
    HybridOutputs,
    HybridPRDOutput,
    HybridRunService,
)
from backend.services.orqaly_research_bundle_service import (
    BUNDLE_VERSION,
    HybridGroundingPolicy,
    HybridResearchMode,
    canonical_hash,
)
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
            location="Bremen",
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
        config=SimulationConfig(
            people_per_stakeholder=1,
            performance_profile=SimulationPerformanceProfile.QUALITY_FAST,
        ),
    )


def _bundle_outputs(**updates) -> HybridOutputs:
    values = {
        "market_sources": True,
        "market_claims": True,
        "synthetic_participants": True,
        "interviews": True,
        "research_bundle": True,
    }
    values.update(updates)
    return HybridOutputs(**values)


BREMEN_EXECUTION_ROLES = [
    "Marketing ICP Research",
    "Finance Pricing",
    "GDPR Legal Compliance",
    "Business Development Sales",
    "Commercial Risk",
]
ORQALY_BREMEN_EXECUTION_ROLES = [
    "Marketing ICP Specialist",
    "Finance Pricing Specialist",
    "GDPR Legal Compliance Specialist",
    "Business Development Sales Specialist",
    "Commercial Risk Analyst",
]
BREMEN_LEGACY_CAPABILITIES = [
    "German Market Localization Specialist",
    "Commercial Pricing Analyst",
    "EU Regulatory & GDPR Compliance Lead",
    "B2B Go-To-Market Strategist",
    "Commercial Risk Analysis",
]
BREMEN_AGENT_NAMES = [
    "Bremen Specialist",
    "Finance Specialist",
    "Lawyer",
    "Business Development Manager",
    "Risk Manager",
]


def _bremen_task_context() -> OrqalyTaskContext:
    return OrqalyTaskContext(
        task_id="bremen-commercial-goal",
        title="Build a grounded Bremen commercial plan",
        description="Research the market and produce an actionable commercial plan",
        desired_outcome="A sourced, GDPR-safe Bremen go-to-market plan",
        category="commercial strategy",
        required_capabilities=BREMEN_LEGACY_CAPABILITIES,
        required_execution_roles=ORQALY_BREMEN_EXECUTION_ROLES,
    )


def _bremen_agents():
    return [
        OrqalyAgentCandidate(
            agent_id=f"agent-{index}",
            name=name,
            role=name,
            capabilities=[name],
        )
        for index, name in enumerate(BREMEN_AGENT_NAMES, start=1)
    ]


class FakeOrchestrator:
    def __init__(self, session_factory):
        self.session_factory = session_factory
        self.finalized = []
        self.finalize_flags = []
        self.parsed_questionnaires = []
        self.performance_profiles = []
        self.pipeline_b_problems = []

    async def parse_raw_questionnaire(self, content, config):
        self.parsed_questionnaires.append(content)
        return SimulationRequest(
            business_context=BusinessContext(
                business_idea="Parsed research brief",
                target_customer="Operations stakeholders",
                problem="Unresolved operational delays",
            ),
            questions_data=QuestionsData(
                stakeholders={
                    "operations": [
                        Stakeholder(
                            id="operations-lead",
                            name="Operations Lead",
                            description="Owns operational performance",
                            questions=["Which delay matters most?"],
                        )
                    ]
                }
            ),
            config=config,
        )

    async def simulate_with_persistence(
        self, request, user_id, simulation_id=None, finalize=True
    ):
        self.finalize_flags.append(finalize)
        self.performance_profiles.append(request.config.performance_profile.value)
        self.pipeline_b_problems.append(request.business_context.problem)
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
            "pain_points": [
                "Cannot approve commercial budget without traceable local evidence"
            ],
            "goals_and_motivations": [
                "Choose a defensible Bremen offer with measurable commercial outcomes"
            ],
            "buying_behavior": {
                "decision_criteria": [
                    "Traceable proof",
                    "clear fixed-price scope",
                    "GDPR-safe delivery",
                ]
            },
            "communication_style": "Direct, evidence-first, and concise",
            "confidence": 0.82,
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
    result.persona_patterns = [
        PersonaPattern(
            id="pattern-traceable-proof",
            name="Traceable proof before budget",
            description="The buyer requires cited evidence before commitment.",
            stakeholder_type="research",
            traits=[],
            key_quotes=[quote],
            people_ids=["person-1"],
            confidence=0.82,
            frequency=1.0,
        )
    ]
    result.data = {
        **(result.data or {}),
        "contradictions": [
            {
                "topic": "speed versus proof",
                "finding": "The buyer wants fast outreach but requires traceable proof first.",
            }
        ],
    }
    return result


async def fake_grounding(_request, _policy):
    return {
        "market_sources": [
            {
                "source_id": "source-bremen-registry",
                "source_type": "company_registry",
                "title": "German company registry HRB 123",
                "url": None,
                "publisher": "Handelsregister/OpenRegister",
                "company_id": "company-1",
                "company_name": "Grounded Research GmbH",
                "registry": {"register_number": "HRB 123"},
            }
        ],
        "market_claims": [
            {
                "claim_id": "claim-company-presence",
                "claim_type": "market_presence",
                "subject": "Grounded Research GmbH",
                "predicate": "operates_in",
                "object": "Bremen",
                "source_ids": ["source-bremen-registry"],
                "verification_status": "source_associated_not_independently_verified",
            }
        ],
        "structured_source_count": 1,
        "claim_count": 1,
        "company_count": 1,
        "composer_version": "regional_google_registry_v1",
    }


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
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
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
    with pytest.raises(ValueError, match="different request"):
        service.enqueue(
            _request(),
            HybridOutputs(),
            user,
            "orqaly-org-1",
            "orqaly-user-1",
            "idem-1",
            "trace-grounding-policy-change",
            research_mode=HybridResearchMode.GROUNDED_HYBRID,
            grounding_policy=HybridGroundingPolicy(required=True),
        )


@pytest.mark.asyncio
async def test_worker_publishes_only_after_hybrid_result_is_persisted(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        _bundle_outputs(persona_resolution=True),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-2",
        "trace-4",
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
        task_context=_bremen_task_context(),
        agent_candidates=_bremen_agents(),
    )

    claimed_id = await service.process_next()
    assert claimed_id == run.job_id
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(run.job_id, "axwise-user-1", "orqaly-org-1")
    assert persisted.status == "completed", persisted.error
    assert persisted.progress_percentage == 100
    assert persisted.current_stage == "completed"
    assert persisted.dataset["empirical_personas"][0]["name"] == "Alex Researcher"
    assert persisted.result_summary["evidence_item_count"] == 1
    bundle = persisted.dataset["data"]["research_bundle"]
    assert bundle["version"] == BUNDLE_VERSION
    assert bundle["status"] == "completed"
    assert bundle["run_id"] == persisted.job_id
    assert bundle["configuration"]["business_context"]["problem"] == (
        "Research plans are vague"
    )
    assert bundle["market_sources"][0]["source_type"] == "company_registry"
    assert bundle["market_claims"][0]["predicate"] == "operates_in"
    assert len(bundle["synthetic_participants"]) == 1
    assert len(bundle["interviews"]) == 1
    assert len(bundle["customer_personas"]) == 1
    assert len(bundle["selected_persona_ids"]) == 1
    assert bundle["customer_personas"][0]["selection_status"] == "selected_primary"
    assert bundle["selected_persona_ids"] == [
        bundle["customer_personas"][0]["persona_id"]
    ]
    assert {item["required_role"] for item in bundle["executor_personas"]} == set(
        BREMEN_EXECUTION_ROLES
    )
    assert len(bundle["executor_personas"]) == 5
    assert len(bundle["persona_assignments"]) == 5
    assert bundle["persona_resolution"]["customer_persona_id"] == (
        bundle["selected_persona_ids"][0]
    )
    assert set(bundle["persona_resolution"]["executor_persona_ids"]) == {
        item["persona_id"] for item in bundle["executor_personas"]
    }
    assert bundle["persona_resolution"]["required_execution_roles"] == (
        BREMEN_EXECUTION_ROLES
    )
    assert all(
        assignment["assignment_status"] == "matched_candidate"
        and assignment["agent_id"]
        and assignment["assignment_role"] == assignment["required_role"]
        and assignment["customer_persona_ids"] == bundle["selected_persona_ids"]
        for assignment in bundle["persona_assignments"]
    )
    assert {
        assignment["required_role"]: assignment["agent_name"]
        for assignment in bundle["persona_assignments"]
    } == dict(zip(BREMEN_EXECUTION_ROLES, BREMEN_AGENT_NAMES))
    assert all(
        item["persona"]["profile_type"] == "synthetic_professional_profile"
        and item["source_ids"] == ["source-bremen-registry"]
        and item["persona"]["customer_persona_ids"]
        for item in bundle["executor_personas"]
    )
    profiles = {
        item["required_role"]: item["persona"]
        for item in bundle["executor_personas"]
    }
    assert len({tuple(profile["expertise"]) for profile in profiles.values()}) == 5
    assert len(
        {
            tuple(profile["output_contract"]["expected_outputs"])
            for profile in profiles.values()
        }
    ) == 5
    assert all(
        profile["profile_version"] == "axwise_executor_persona_v1"
        and profile["identity_disclosure"].startswith("Synthetic non-human")
        and profile["customer_adaptation"]["locale"] == "Bremen"
        and profile["customer_adaptation"]["selected_customer"]["name"]
        == "Alex Researcher"
        and "traceable local evidence"
        in profile["customer_adaptation"]["selected_customer"]["pain_signals"][0]
        and profile["research_context"]["source_ids"]
        == ["source-bremen-registry"]
        and profile["research_context"]["claim_refs"][0]["claim_id"]
        == "claim-company-presence"
        and profile["research_context"]["pattern_refs"][0]["pattern_id"]
        and profile["research_context"]["contradiction_refs"][0][
            "contradiction_id"
        ]
        and profile["research_context"]["research_prd"]["analysis_result_id"]
        == int(persisted.analysis_id)
        for profile in profiles.values()
    )
    assert "ideal-customer-profile segmentation" in profiles[
        "Marketing ICP Research"
    ]["expertise"]
    assert "EU GDPR role and lawful-basis analysis" in profiles[
        "GDPR Legal Compliance"
    ]["expertise"]
    assert "commercial funnel and KPI architecture" in profiles[
        "Commercial Risk"
    ]["expertise"]
    assert bundle["limitations"]
    assert bundle["method"]["evidence_labels"]["interviews"] == "synthetic"
    assert bundle["research_prd"]["status"] == "not_requested"
    assert bundle["quality"]["grounding_satisfied"] is True
    assert bundle["quality"]["matched_persona_assignment_count"] == 5
    assert bundle["quality"]["pending_persona_assignment_count"] == 0
    hash_input = {key: value for key, value in bundle.items() if key != "bundle_hash"}
    assert bundle["bundle_hash"] == canonical_hash(hash_input)
    assert persisted.result_summary["research_bundle_hash"] == bundle["bundle_hash"]
    assert persisted.analysis_id
    assert orchestrator.finalize_flags == [False]
    assert orchestrator.parsed_questionnaires == []
    assert orchestrator.performance_profiles == ["quality_fast"]
    assert "EXTERNAL REGIONAL MARKET EVIDENCE" in orchestrator.pipeline_b_problems[0]
    assert "Grounded Research GmbH" in orchestrator.pipeline_b_problems[0]
    assert orchestrator.finalized == [persisted.simulation_id]

    session = session_factory()
    simulation = session.query(SimulationData).filter_by(simulation_id=persisted.simulation_id).first()
    analysis = session.query(AnalysisResult).filter_by(result_id=int(persisted.analysis_id)).first()
    session.close()
    assert simulation.status == "completed"
    assert simulation.empirical_personas[0]["name"] == "Alex Researcher"
    assert analysis.status == "completed"
    assert analysis.results["research_bundle"]["bundle_hash"] == bundle["bundle_hash"]

    serialized = service.serialize_run(persisted, include_result=True)
    assert serialized["research_bundle"]["bundle_hash"] == bundle["bundle_hash"]

    assert service.get_run_for_tenant(run.job_id, "axwise-user-1", "other-org") is None


@pytest.mark.asyncio
async def test_required_grounding_fails_closed_before_synthetic_people(session_factory):
    async def empty_grounding(_request, _policy):
        return {
            "market_sources": [],
            "market_claims": [],
            "structured_source_count": 0,
        }

    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, empty_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        _bundle_outputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-grounding-required",
        "trace-grounding-required",
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "failed"
    assert "structured real sources" in persisted.error
    assert orchestrator.finalize_flags == []
    assert orchestrator.pipeline_b_problems == []


@pytest.mark.asyncio
async def test_required_grounding_does_not_trust_a_declared_count_without_real_sources(
    session_factory,
):
    async def dishonest_grounding(_request, _policy):
        return {
            "market_sources": [
                {
                    "source_id": "fake-source",
                    "source_type": "google_search_result",
                    "title": "No URL",
                    "url": None,
                }
            ],
            "market_claims": [],
            "structured_source_count": 99,
        }

    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, dishonest_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        _bundle_outputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-dishonest-grounding-count",
        "trace-dishonest-grounding-count",
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "failed"
    assert orchestrator.finalize_flags == []


@pytest.mark.asyncio
async def test_requested_prd_ids_and_hash_are_in_the_versioned_bundle(
    session_factory, monkeypatch
):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    prd_content = {"prd_type": "both", "operational_prd": {"objectives": []}}

    async def generate_prd(analysis_result_id, _request, _outputs, _user_id):
        return (
            service._prd_metadata(
                "completed",
                analysis_result_id,
                "both",
                content=prd_content,
                cached_prd_id=77,
            ),
            None,
        )

    monkeypatch.setattr(service, "_generate_prd", generate_prd)
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        _bundle_outputs(
            persona_resolution=True,
            prd=HybridPRDOutput(enabled=True, required=True),
        ),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-bundle-prd",
        "trace-bundle-prd",
        task_context=_bremen_task_context(),
        agent_candidates=_bremen_agents(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    bundle = persisted.dataset["data"]["research_bundle"]
    assert persisted.status == "completed"
    assert bundle["research_prd"] == {
        "status": "completed",
        "analysis_result_id": int(persisted.analysis_id),
        "cached_prd_id": 77,
        "prd_type": "both",
        "content_hash": canonical_hash(prd_content),
        "content": prd_content,
    }
    assert bundle["research_prd_hash"] == canonical_hash(prd_content)
    assert all(
        item["persona"]["research_context"]["research_prd"] == {
            "analysis_result_id": int(persisted.analysis_id),
            "cached_prd_id": 77,
            "content_hash": canonical_hash(prd_content),
            "prd_type": "both",
            "status": "completed",
        }
        for item in bundle["executor_personas"]
    )
    assert any(
        artifact["artifact_type"] == "research_prd"
        and artifact["artifact_id"] == "cached-prd-77"
        for artifact in bundle["artifacts"]
    )


def test_enqueue_rejects_missing_bundle_outputs_and_grounding_location(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()

    with pytest.raises(ValueError, match="market_sources"):
        service.enqueue(
            _request(),
            _bundle_outputs(market_sources=False),
            user,
            "orqaly-org-1",
            "orqaly-user-1",
            "idem-missing-output",
            "trace-missing-output",
        )

    request_without_location = _request().model_copy(
        update={
            "business_context": _request().business_context.model_copy(
                update={"location": None}
            )
        }
    )
    with pytest.raises(ValueError, match="business_context.location"):
        service.enqueue(
            request_without_location,
            _bundle_outputs(),
            user,
            "orqaly-org-1",
            "orqaly-user-1",
            "idem-no-location",
            "trace-no-location",
            research_mode=HybridResearchMode.GROUNDED_HYBRID,
            grounding_policy=HybridGroundingPolicy(required=True),
        )


@pytest.mark.asyncio
async def test_worker_parses_raw_questionnaire_before_durable_execution(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    request = SimulationRequest(
        business_context=BusinessContext(
            business_idea="Improve operations",
            target_customer="Unknown stakeholder",
            problem="Operational delays",
        ),
        raw_questionnaire_content="- Who experiences the operational delay?",
        config=SimulationConfig(people_per_stakeholder=1),
    )
    run, _ = service.enqueue(
        request,
        HybridOutputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-raw-questionnaire",
        "trace-raw-questionnaire",
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(run.job_id, "axwise-user-1", "orqaly-org-1")
    assert persisted.status == "completed"
    assert "research_bundle" not in (persisted.dataset.get("data") or {})
    assert orchestrator.parsed_questionnaires == [
        "- Who experiences the operational delay?"
    ]


@pytest.mark.asyncio
async def test_worker_persists_customer_and_execution_persona_resolution(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
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
