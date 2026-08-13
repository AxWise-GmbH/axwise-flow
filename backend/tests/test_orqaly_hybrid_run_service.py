import asyncio
import hashlib
import json
import os
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    CompanyDiscoveryItem,
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
from backend.models import CachedPRD
from backend.domain.market_scope import resolve_market_expression
from backend.services.orqaly_hybrid_run_service import (
    HybridOutputs,
    HybridPRDOutput,
    HybridRunService,
    _strip_private_grounding_artifacts,
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
from backend.services.research_source_authority_service import (
    _commercial_offer_evidence,
    _normalized_document_text,
    _structured_statistical_observations,
    build_authority_claim_artifact,
    build_attested_authority_proof,
    build_direct_primary_market_proof,
    build_recognized_root_proof,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    ImmutableGoalTopicFields,
    TopicSeedContract,
    build_topic_seed,
)

pytestmark = pytest.mark.contract
os.environ.setdefault(
    "AXWISE_AUTHORITY_PROOF_SECRET", "test-authority-secret-32-bytes-minimum"
)


def test_private_direct_documents_are_scrubbed_after_quality_boundary():
    grounding = {
        "market_sources": [{
            "source_id": "signed-source",
            "url": "https://example.test/evidence",
            "_authority_document_artifact": {"text": "private normalized page"},
            "_structured_evidence_html": "<table>private raw table</table>",
            "authority_document": {"sha256": "a" * 64},
        }],
        "market_claims": [],
    }

    scrubbed = _strip_private_grounding_artifacts(grounding)

    assert "_authority_document_artifact" not in scrubbed["market_sources"][0]
    assert "_structured_evidence_html" not in scrubbed["market_sources"][0]
    assert scrubbed["market_sources"][0]["authority_document"] == {"sha256": "a" * 64}


def test_topic_seed_maps_immutable_goal_and_confirmed_scope_without_location():
    request = _request().model_copy(
        update={
            "business_context": _request().business_context.model_copy(
                update={
                    "business_idea": "Cat food distribution",
                    "problem": "Assess cat food demand and channel fit",
                    "industry": "Pet food",
                    "target_customer": "Pet-food category buyer",
                    "location": None,
                    "market_scope": resolve_market_expression(
                        "United States and Canada"
                    ),
                }
            )
        }
    )
    task = OrqalyTaskContext(
        task_id="cat-food-us-ca",
        title="Cat food commercial launch",
        description="Assess cat food demand in both confirmed markets",
        desired_outcome="A grounded cat food launch decision",
        research_prd_type="commercial_market_launch",
    )

    dumped = HybridRunService._topic_seed_contract(request, task, ["US", "CA"])
    seed = TopicSeedContract.model_validate(dumped)

    assert "cat food" in seed.exact_goal_anchors
    assert "pet food" in seed.exact_goal_anchors
    assert seed.confirmed_country_codes == ("CA", "US")
    assert seed.confirmed_market_scope_sha256
    assert all(binding.source_span_sha256 for binding in seed.anchor_bindings)


@pytest.mark.parametrize("location", ["Estonia", "Bremen, Germany"])
def test_location_only_unambiguous_market_builds_topic_seed(location):
    request = _request().model_copy(
        update={
            "business_context": _request().business_context.model_copy(
                update={"location": location, "market_scope": None}
            )
        }
    )
    scope = resolve_market_expression(location)
    country_codes = [
        country.country_code for country in scope.resolved_scope.countries
    ]

    seed = HybridRunService._topic_seed_contract(
        request, _commercial_task_context(), country_codes
    )

    assert TopicSeedContract.model_validate(seed).confirmed_country_codes == tuple(
        sorted(country_codes)
    )


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
            market_scope=resolve_market_expression("Bremen, Germany"),
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


BREMEN_PLAYBOOK_ROLES = [
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
BREMEN_EXECUTION_ROLES = ORQALY_BREMEN_EXECUTION_ROLES
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
        self.pipeline_b_grounding_contexts = []

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
        self.pipeline_b_grounding_contexts.append(
            request.business_context.grounding_context
        )
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


def test_analysis_result_prepends_authoritative_goal_contract(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    result = SimulationResponse(
        success=True,
        message="complete",
        simulation_id="sim-contract",
        interviews=[],
    )
    context = OrqalyTaskContext(
        title="Bremen commercial plan",
        description="Deliver 3 ICPs, 3 packages, outreach, funnel, and risk matrix",
        desired_outcome="A four-week German commercial plan",
        constraints=["No external execution tools"],
    )

    result_id = service._create_canonical_analysis_result(
        result, _request(), "axwise-user-1", context
    )

    session = session_factory()
    try:
        analysis = session.query(AnalysisResult).filter_by(result_id=result_id).one()
        assert analysis.results["original_text"].startswith(
            "AUTHORITATIVE ORQALY GOAL CONTRACT"
        )
        assert "Deliver 3 ICPs, 3 packages" in analysis.results["original_text"]
        assert "No external execution tools" in analysis.results["original_text"]
        assert "SYNTHETIC INTERVIEW CORPUS" in analysis.results["original_text"]
    finally:
        session.close()


@pytest.mark.asyncio
async def test_commercial_hybrid_run_repairs_then_caches_and_bundles_valid_prd(
    session_factory, monkeypatch
):
    llm = RepairingCommercialLLM()
    monkeypatch.setattr(
        "backend.services.orqaly_hybrid_run_service.LLMServiceFactory.create",
        lambda _provider: llm,
    )
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, commercial_enrichment, commercial_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    outputs = _bundle_outputs(
        persona_resolution=True,
        prd=HybridPRDOutput(
            enabled=True,
            type="commercial_market_launch",
            required=True,
        ),
    )
    run, _ = service.enqueue(
        _request(),
        outputs,
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-commercial-prd",
        "trace-commercial-prd",
        task_context=_commercial_task_context(),
        agent_candidates=_bremen_agents(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(
            required=True,
            allowed_source_types=["google_search_result"],
        ),
    )

    await service.process_job(run.job_id)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "completed", persisted.error
    assert len(llm.requests) == 2
    first_envelope = __import__("json").loads(llm.requests[0]["text"])
    second_envelope = __import__("json").loads(llm.requests[1]["text"])
    assert first_envelope["repair_feedback"] == []
    assert second_envelope["repair_feedback"]
    bundle = persisted.dataset["data"]["research_bundle"]
    serialized_result = json.dumps(persisted.dataset, sort_keys=True)
    assert "_authority_document_artifact" not in serialized_result
    assert "_structured_evidence_html" not in serialized_result
    assert '"raw_html"' not in serialized_result
    assert bundle["research_prd"]["status"] == "completed"
    assert bundle["research_prd"]["prd_type"] == "commercial_market_launch"
    assert bundle["research_prd"]["content"]["metadata"]["validation"][
        "status"
    ] == "passed"
    assert bundle["quality"]["critical_claims"]["status"] == "passed"
    assert bundle["quality"]["critical_claims"]["evidence_ledger"]
    assert bundle["quality"]["critical_claims"]["applicable_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    assert bundle["quality"]["critical_claims"]["mandatory_claim_classes"] == (
        bundle["quality"]["critical_claims"]["applicable_claim_classes"]
    )
    assert bundle["quality"]["critical_claims"]["not_applicable_claim_classes"] == []
    assert bundle["quality"]["critical_claims"]["verified_claim_classes"] == [
        "observed_primary_market",
        "official_statistic",
        "statutory_current",
    ]
    assert any(
        source["source_authority"] == "first_party_catalog"
        and source["authority_proof_signature"]
        for row in bundle["quality"]["critical_claims"]["evidence_ledger"]
        for source in row["sources"]
    )
    assert bundle["quality"]["requested_execution_roles"] == (
        ORQALY_BREMEN_EXECUTION_ROLES
    )
    assert bundle["quality"]["returned_execution_roles"] == (
        ORQALY_BREMEN_EXECUTION_ROLES
    )
    assert bundle["quality"]["executor_role_coverage"] == {
        "status": "complete",
        "requested_count": 5,
        "returned_count": 5,
        "missing_roles": [],
        "unexpected_roles": [],
        "role_matches": [
            {"requested_role": role, "returned_role": role, "covered": True}
            for role in ORQALY_BREMEN_EXECUTION_ROLES
        ],
    }
    assert bundle["research_context"]["selected_customer"]["buyer_role"] is True
    assert bundle["research_context"]["selected_customer"]["evidence_refs"]
    assert all(row["evidence_refs"] for row in bundle["executor_personas"])

    session = session_factory()
    cached = session.query(CachedPRD).filter_by(
        result_id=int(persisted.analysis_id), prd_type="operational"
    ).one()
    analysis = session.query(AnalysisResult).filter_by(
        result_id=int(persisted.analysis_id)
    ).one()
    session.close()
    assert cached.prd_data["prd_type"] == "commercial_market_launch"
    assert cached.prd_data["metadata"]["validation"]["status"] == "passed"
    assert analysis.results["research_bundle"]["bundle_hash"] == bundle["bundle_hash"]


@pytest.mark.asyncio
async def test_commercial_hybrid_run_blocks_generic_prd_and_does_not_cache(
    session_factory, monkeypatch
):
    llm = RepairingCommercialLLM(always_invalid=True)
    monkeypatch.setattr(
        "backend.services.orqaly_hybrid_run_service.LLMServiceFactory.create",
        lambda _provider: llm,
    )
    service = HybridRunService(
        FakeOrchestrator(session_factory),
        session_factory,
        commercial_enrichment,
        commercial_grounding,
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    run, _ = service.enqueue(
        _request(),
        _bundle_outputs(
            persona_resolution=True,
            prd=HybridPRDOutput(
                enabled=True,
                type="commercial_market_launch",
                required=True,
            ),
        ),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-commercial-invalid",
        "trace-commercial-invalid",
        task_context=_commercial_task_context(),
        agent_candidates=_bremen_agents(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(
            required=True,
            allowed_source_types=["google_search_result"],
        ),
    )

    await service.process_job(run.job_id)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "failed"
    assert len(llm.requests) == 2
    session = session_factory()
    assert session.query(CachedPRD).count() == 0
    session.close()


@pytest.mark.asyncio
async def test_critical_gate_resumes_deferred_company_enrichment_once(session_factory):
    deferred = DeferredCompanyPipeline()

    async def grounding(request, policy):
        result = await commercial_grounding(request, policy)
        result["_deferred_company_enrichment"] = [
            {"pipeline": deferred, "policy": policy}
        ]
        return result

    service = HybridRunService(
        FakeOrchestrator(session_factory),
        session_factory,
        commercial_enrichment,
        grounding,
    )
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
        "idem-deferred-pass",
        "trace-deferred-pass",
        task_context=_commercial_task_context(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    await service.process_job(run.job_id)
    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "completed", persisted.error
    assert deferred.calls == 1
    market_grounding = persisted.dataset["data"]["market_grounding"]
    assert "_authority_document_artifact" not in json.dumps(market_grounding)
    assert "_structured_evidence_html" not in json.dumps(market_grounding)
    assert "_deferred_company_enrichment" not in market_grounding
    assert market_grounding["company_count"] == 1
    assert any(
        row["source_type"] == "official_company_website"
        for row in market_grounding["market_sources"]
    )


@pytest.mark.asyncio
async def test_failed_critical_gate_never_runs_deferred_company_enrichment(
    session_factory,
):
    deferred = DeferredCompanyPipeline()

    async def grounding(request, policy):
        result = await commercial_grounding(request, policy)
        result["market_claims"] = [
            row
            for row in result["market_claims"]
            if row.get("evidence_class") != "official_statistic"
        ]
        result["claim_count"] = len(result["market_claims"])
        result["routing_diagnostics"] = {
            "required_evidence_classes": ["official_statistic"],
            "providers": [
                {
                    "provider": "searxng:official_statistic",
                    "evidence_class": "official_statistic",
                    "query_id": "query-stat",
                    "source_count": 0,
                    "result_source_count": 0,
                    "reason": "empty_or_failed token=secret",
                    "runtime": {
                        "route": "searxng",
                        "status": "empty",
                        "elapsed_ms": 1200,
                        "call_count": 1,
                        "unresponsive_engines": [
                            {"engine": "brave", "reason": "suspended token=secret"}
                        ],
                    },
                }
            ],
            "attempted_sources": [
                {
                    "retrieval_host": "stat.ee",
                    "final_host": "stat.ee",
                    "acquisition_evidence_classes": ["official_statistic"],
                    "direct_fetch_status": "retrieved",
                    "jurisdiction_binding_status": "verified",
                    "authority_verification_status": "unverified",
                }
            ],
            "evidence_class_acquisition": {
                "official_statistic": {
                    "attempted": 1,
                    "retrieved": 1,
                    "verified": 0,
                    "claim_extracted": 0,
                }
            },
        }
        result["_deferred_company_enrichment"] = [
            {"pipeline": deferred, "policy": policy}
        ]
        return result

    service = HybridRunService(
        FakeOrchestrator(session_factory),
        session_factory,
        commercial_enrichment,
        grounding,
    )
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
        "idem-deferred-block",
        "trace-deferred-block",
        task_context=_commercial_task_context(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    await service.process_job(run.job_id)
    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "failed"
    assert "mandatory_claim_class_missing:official_statistic" in persisted.error
    assert deferred.calls == 0
    failure = persisted.result_summary["failure_diagnostics"]
    assert failure["evidence_class_acquisition"]["official_statistic"] == {
        "attempted": 1,
        "retrieved": 1,
        "verified": 0,
        "claim_extracted": 0,
    }
    assert failure["attempted_sources"][0]["final_host"] == "stat.ee"
    assert "secret" not in str(failure).casefold()


@pytest.mark.asyncio
@pytest.mark.parametrize("mutation", ["omit", "replace"])
async def test_process_blocks_omitted_or_replaced_topic_contract(
    session_factory,
    mutation,
):
    async def grounding(request, policy):
        result = await commercial_grounding(request, policy)
        if mutation == "omit":
            result.pop("topic_seed_contract", None)
        else:
            result["topic_seed_contract"] = build_topic_seed(
                ImmutableGoalTopicFields(
                    goal_id="different-goal",
                    title="Industrial robotics deployment",
                    problem_scope="Assess industrial robotics adoption.",
                    industry="Industrial robotics",
                    exact_topic_anchors=("industrial robotics",),
                ),
                ConfirmedMarketScope(
                    scope_label="Germany",
                    country_codes=("DE",),
                    confirmed=True,
                ),
            ).model_dump(mode="json")
        return result

    service = HybridRunService(
        FakeOrchestrator(session_factory),
        session_factory,
        commercial_enrichment,
        grounding,
    )
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
        f"idem-topic-{mutation}",
        f"trace-topic-{mutation}",
        task_context=_commercial_task_context(),
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(required=True),
    )

    await service.process_job(run.job_id)
    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )

    assert persisted.status == "failed"
    assert "omitted or replaced" in persisted.error
    failure = persisted.result_summary["failure_diagnostics"]
    assert failure["blocked_reason_counts"] == {
        "topic_contract_missing_or_invalid": 1
    }


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


def _commercial_prd_content() -> dict:
    return {
        "prd_type": "commercial_market_launch",
        "commercial_prd": {
            "market_scope": {"country": "Germany", "city": "Bremen"},
            "market_and_demand_assessment": ["Grounded local demand assessment"],
            "customer_segments": ["Commercial category buyers"],
            "buying_roles": ["Economic buyer and operational user are separated"],
            "regulatory_checklist": [
                {
                    "statement": "Germany's standard VAT rate is 19%.",
                    "claim_ids": ["claim-de-vat"],
                }
            ],
            "competitors": ["Competitor evidence requires sourced field validation"],
            "suppliers_and_channels": ["Specialist retail and direct channels"],
            "pricing_and_unit_economics": {
                "statement": "Net price derives from gross price and verified VAT.",
                "formula": "net_price = gross_price / (1 + vat_rate)",
                "input_claim_ids": ["claim-de-vat"],
            },
            "go_to_market_plan_90_days": ["Validate", "Pilot", "Scale"],
            "risks_assumptions_and_validation": [
                "Validate synthetic buyer assumptions in field conversations"
            ],
        },
    }


class RepairingCommercialLLM:
    def __init__(self, *, always_invalid: bool = False):
        self.always_invalid = always_invalid
        self.requests = []

    async def analyze(self, request):
        self.requests.append(dict(request))
        if self.always_invalid or len(self.requests) == 1:
            return {"operational_prd": {"workflow": "generic fallback"}}
        return _commercial_prd_content()


async def commercial_enrichment(result, request):
    result = await fake_enrichment(result, request)
    persona = result.empirical_personas[0]
    persona.update(
        {
            "name": "Markus Weber, Commercial Director",
            "role": "Commercial Director",
            "stakeholder_intelligence": {
                "stakeholder_type": "economic buyer",
                "decision_role": "economic buyer",
            },
        }
    )
    return result


async def commercial_grounding(_request, _policy):
    vat_claim = "Germany's standard VAT rate is 19% effective 2025-01-01."
    statistic_claim = (
        "Germany's latest official market population is 84 million for 2025."
    )
    price_claim = (
        "premium research technology subscription The current retail price is €2.99"
    )
    source_url = "https://tax.gov.de/current-market-facts"
    catalog_url = "https://shop.example.de/research-technology"
    retrieved_at = "2026-08-12T12:00:00+00:00"
    direct_text = (
        "Government tax authority current value-added tax guidance. " + vat_claim
    )
    proof = build_recognized_root_proof(
        direct_url=source_url,
        direct_text=direct_text,
        country_codes=["DE"],
        retrieved_at=retrieved_at,
    )
    stat_html = """
    <figure data-uuid="research-technology-demand">
      <h2>Research technology demand</h2>
      <a href="https://stats.example.de/en/stat/RT001">dataset</a>
      <table data-series-orientation="column"><thead><tr>
        <th data-series-name="Research technology buyers"
          data-series-unit="million persons">Research technology buyers</th>
      </tr></thead><tbody><tr>
        <th data-category="2025">2025</th><td>84</td>
      </tr></tbody></table><p>Last updated: 27 May 2026</p>
    </figure>
    """
    stat_observations = _structured_statistical_observations(stat_html)
    stat_text = (
        "German official statistics office. "
        + _normalized_document_text(stat_html, is_html=True)
    )
    stat_url = "https://statistics.gov.de/research-technology-demand"
    stat_proof = build_attested_authority_proof(
        direct_url=stat_url,
        direct_text=stat_text,
        attestation_url="https://european-union.europa.eu/germany-authorities",
        attestation_text=(
            "Official statistics authority directory: https://statistics.gov.de"
        ),
        country_codes=["DE"],
        retrieved_at=retrieved_at,
        structured_statistical_observations=stat_observations,
        direct_raw_html=stat_html,
    )
    stat_source_id = "source-de-research-technology-stat"
    stat_document = {
        "artifact_type": "direct_authority_document",
        "source_id": stat_source_id,
        "text": stat_text,
        "sha256": hashlib.sha256(stat_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": stat_proof["proof_signature"],
    }
    catalog_offer_html = (
        '<script type="application/ld+json">'
        '{"@type":"Product","sku":"RESEARCH-TECH","name":'
        '"premium research technology subscription","offers":'
        '{"@type":"Offer","price":"2.99","priceCurrency":"EUR"}}'
        "</script>"
    )
    catalog_raw_html = (
        '<div>Official product catalogue for Germany.</div>'
        '<article class="product-card">'
        '<h1>premium research technology subscription</h1>'
        '<div class="price">The current retail price is €2.99</div>'
        f'<div>Observed on 2026-08-12.</div></article>{catalog_offer_html}'
    )
    catalog_text = _normalized_document_text(catalog_raw_html, is_html=True)
    catalog_proof = build_direct_primary_market_proof(
        direct_url=catalog_url,
        direct_text=catalog_text,
        country_codes=["DE"],
        commercial_offer_evidence=_commercial_offer_evidence(catalog_raw_html),
        direct_raw_html=catalog_raw_html,
        retrieved_at=retrieved_at,
    )
    authority_document = {
        "artifact_type": "direct_authority_document",
        "source_id": "source-de-government-facts",
        "text": direct_text,
        "sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof["proof_signature"],
    }
    catalog_document = {
        "artifact_type": "direct_authority_document",
        "source_id": "source-de-research-technology-catalog",
        "text": catalog_text,
        "sha256": hashlib.sha256(catalog_text.encode("utf-8")).hexdigest(),
        "retrieved_at": retrieved_at,
        "authority_proof_signature": catalog_proof["proof_signature"],
    }

    def claim_row(
        *,
        claim_id,
        text,
        predicate,
        evidence_class,
        source_id,
        url,
        source_proof,
        document,
        **temporal,
    ):
        artifact = build_authority_claim_artifact(
            source_id=source_id,
            source_url=url,
            authority_proof=source_proof,
            authority_document=document,
            claim_text=text,
        )
        binding = artifact["claim_binding"]
        return {
            "claim_id": claim_id,
            "claim_type": "grounded_web_evidence",
            "subject": "Germany",
            "predicate": predicate,
            "object": text,
            "source_ids": [source_id],
            "country_codes": ["DE"],
            "critical": True,
            "evidence_class": evidence_class,
            "provider": "searxng",
            "provider_query_ids": [f"query-{claim_id}"],
            "provider_queries": [f"Germany {predicate}"],
            "citation_metadata": {
                "segment_start": binding["claim_start"],
                "segment_end": binding["claim_end"],
                "span_target": "direct_authority_document",
                "offset_unit": "unicode_codepoints",
                "source_id": source_id,
            },
            "provenance_artifact": artifact,
            **temporal,
        }

    acquisition_contract = (
        ((_request.business_context.grounding_context or {}).get(
            "critical_claim_acquisition", {}
        ) or {})
        if _request.business_context
        else {}
    )
    topic_seed_contract = acquisition_contract.get("topic_seed_contract")
    topic_market_scope_contract = acquisition_contract.get(
        "topic_market_scope_contract"
    )
    topic_alias_expansion = acquisition_contract.get("topic_alias_expansion")
    return {
        "market_sources": [
            {
                "source_id": "source-de-government-facts",
                "source_type": "google_search_result",
                "title": "Current German tax and official statistics guidance",
                "url": source_url,
                "publisher": "tax.gov.de",
                "provider": "searxng",
                "provider_source_id": "searx-de-government-facts",
                "provider_query_ids": ["query-de-vat", "query-de-population"],
                "provider_queries": [
                    "Germany current VAT effective date",
                    "Germany latest official market population",
                ],
                "country_codes": ["DE"],
                "source_authority": "official_public",
                "authority_verification_status": "recognized_public_root_direct",
                "retrieved_at": retrieved_at,
                "authority_proof": proof,
                "authority_document": {
                    key: value for key, value in authority_document.items() if key != "text"
                },
            },
            {
                "source_id": stat_source_id,
                "source_type": "google_search_result",
                "title": "Research technology demand",
                "url": stat_url,
                "publisher": "statistics.gov.de",
                "provider": "searxng",
                "provider_source_id": "searx-de-research-stat",
                "provider_query_ids": ["query-de-research-stat"],
                "provider_queries": ["Germany research technology statistics"],
                "country_codes": ["DE"],
                "source_authority": "official_public",
                "authority_verification_status": "independently_attested_direct_domain",
                "retrieved_at": retrieved_at,
                "authority_proof": stat_proof,
                "_authority_document_artifact": stat_document,
                "_structured_evidence_html": stat_html,
                "authority_document": {
                    key: value for key, value in stat_document.items() if key != "text"
                },
            },
            {
                "source_id": "source-de-research-technology-catalog",
                "source_type": "google_search_result",
                "title": "Current German research technology catalogue",
                "url": catalog_url,
                "publisher": "shop.example.de",
                "provider": "searxng",
                "provider_source_id": "searx-de-research-technology-price",
                "provider_query_ids": ["query-de-research-technology-price"],
                "provider_queries": [
                    "Germany research technology retail catalogue price"
                ],
                "country_codes": ["DE"],
                "source_authority": "first_party_catalog",
                "authority_verification_status": "direct_primary_market_observation",
                "retrieved_at": retrieved_at,
                "authority_proof": catalog_proof,
                "_authority_document_artifact": catalog_document,
                "_structured_evidence_html": catalog_raw_html,
                "authority_document": {
                    key: value
                    for key, value in catalog_document.items()
                    if key != "text"
                },
            },
        ],
        "market_claims": [
            claim_row(
                claim_id="claim-de-vat",
                text=vat_claim,
                predicate="standard VAT rate",
                evidence_class="statutory_current",
                source_id="source-de-government-facts",
                url=source_url,
                source_proof=proof,
                document=authority_document,
                effective_at="2025-01-01T00:00:00+00:00",
                current=True,
            ),
            {
                **claim_row(
                    claim_id="claim-de-population",
                    text=stat_observations[0]["row_text"],
                    predicate="latest official research technology demand",
                    evidence_class="official_statistic",
                    source_id=stat_source_id,
                    url=stat_url,
                    source_proof=stat_proof,
                    document=stat_document,
                    observation_end=stat_observations[0]["observation_end"],
                    published_at=stat_observations[0]["published_at"],
                    latest_release=True,
                ),
                "structured_statistical_observation": stat_observations[0],
            },
            claim_row(
                claim_id="claim-de-research-technology-price",
                text=price_claim,
                predicate="observed retail catalogue price",
                evidence_class="observed_primary_market",
                source_id="source-de-research-technology-catalog",
                url=catalog_url,
                source_proof=catalog_proof,
                document=catalog_document,
                observed_at=retrieved_at,
            ),
        ],
        "structured_source_count": 3,
        "claim_count": 3,
        "company_count": 0,
        "composer_version": "provider_shaped_commercial_fixture_v1",
        "topic_seed_contract": topic_seed_contract,
        "topic_market_scope_contract": topic_market_scope_contract,
        "topic_alias_expansion": topic_alias_expansion,
    }


class DeferredCompanyPipeline:
    def __init__(self):
        self.calls = 0
        self.market_sources = []
        self.market_claims = []

    async def complete_deferred_company_enrichment(self):
        self.calls += 1
        return [
            CompanyDiscoveryItem(
                id="deferred-retailer",
                name="Deferred Retailer GmbH",
                industry="Pet retail",
                size="10-50 employees",
                location="Bremen, Germany",
                latitude=0.0,
                longitude=0.0,
                decision_makers=[],
                estimated_pain_points=["Category margin pressure"],
                website="https://retailer.example.de",
                pain_point_sources=["https://research.example.de/pet-retail"],
            )
        ]


def _commercial_task_context() -> OrqalyTaskContext:
    return _bremen_task_context().model_copy(
        update={
            "research_prd_type": "commercial_market_launch",
            "customer_role_contract": {
                "primary_roles": ["economic_buyer", "decision_authority"],
                "require_primary_buyer": True,
                "ineligible_roles": ["operational_user"],
            },
            "critical_claim_policy": {
                "required": True,
                "fail_closed": True,
                "freshness_days": 120,
                "freshness_by_class": {
                    "official_statistic": 730,
                    "observed_primary_market": 120,
                },
                "mandatory_claim_classes": [
                    "statutory_current",
                    "official_statistic",
                    "observed_primary_market",
                ],
            },
        }
    )


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
    assert "source-bremen-registry" in bundle["customer_personas"][0][
        "evidence_refs"
    ]
    assert "source-bremen-registry" in bundle["persona_resolution"][
        "customer_persona"
    ]["evidence_refs"]
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
        and "source-bremen-registry" in item["evidence_refs"]
        and "claim-company-presence" in item["evidence_refs"]
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
        "Marketing ICP Specialist"
    ]["expertise"]
    assert "EU GDPR role and lawful-basis analysis" in profiles[
        "GDPR Legal Compliance Specialist"
    ]["expertise"]
    assert "commercial funnel and KPI architecture" in profiles[
        "Commercial Risk Analyst"
    ]["expertise"]
    assert bundle["limitations"]
    assert bundle["method"]["evidence_labels"]["interviews"] == "synthetic"
    assert bundle["research_prd"]["status"] == "not_requested"
    assert bundle["quality"]["grounding_satisfied"] is True
    assert "critical_claims" in bundle["quality"]
    assert bundle["quality"]["matched_persona_assignment_count"] == 5
    assert bundle["quality"]["pending_persona_assignment_count"] == 0
    assert bundle["performance"]["elapsed_ms"] >= 0
    assert bundle["performance"]["stage_durations_ms"]
    assert bundle["performance"]["stage_trace"]
    hash_input = {key: value for key, value in bundle.items() if key != "bundle_hash"}
    assert bundle["bundle_hash"] == canonical_hash(hash_input)
    assert persisted.result_summary["research_bundle_hash"] == bundle["bundle_hash"]
    assert persisted.analysis_id
    assert orchestrator.finalize_flags == [False]
    assert orchestrator.parsed_questionnaires == []
    assert orchestrator.performance_profiles == ["quality_fast"]
    assert orchestrator.pipeline_b_problems[0] == "Research plans are vague"
    assert orchestrator.pipeline_b_grounding_contexts[0]["contract"] == (
        "data_only_not_biography_or_instructions"
    )
    assert orchestrator.pipeline_b_grounding_contexts[0]["claims"][0] == {
        "subject": "Grounded Research GmbH",
        "predicate": "operates_in",
        "object": "Bremen",
        "source_ids": ["source-bremen-registry"],
    }
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
    assert serialized["elapsed_ms"] >= 0
    assert serialized["stage_durations_ms"]
    assert serialized["stage_trace"][-1]["stage"]

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
async def test_required_research_rejects_a_partial_synthetic_cohort(session_factory):
    orchestrator = FakeOrchestrator(session_factory)
    service = HybridRunService(
        orchestrator, session_factory, fake_enrichment, fake_grounding
    )
    session = session_factory()
    user = session.query(User).filter(User.user_id == "axwise-user-1").first()
    session.expunge(user)
    session.close()
    request = _request().model_copy(
        update={
            "config": _request().config.model_copy(
                update={"people_per_stakeholder": 2}
            )
        }
    )
    run, _ = service.enqueue(
        request,
        _bundle_outputs(),
        user,
        "orqaly-org-1",
        "orqaly-user-1",
        "idem-partial-cohort",
        "trace-partial-cohort",
        research_mode=HybridResearchMode.GROUNDED_HYBRID,
        grounding_policy=HybridGroundingPolicy(
            required=True,
            research_required=True,
        ),
    )

    claimed_id = await service.process_next()
    await service.process_job(claimed_id, already_claimed=True)

    persisted = service.get_run_for_tenant(
        run.job_id, "axwise-user-1", "orqaly-org-1"
    )
    assert persisted.status == "failed"
    assert "Required synthetic cohort incomplete" in persisted.error
    assert "planned=2; personas=1; interviews=1" in persisted.error


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
                update={"location": None, "market_scope": None}
            )
        }
    )
    with pytest.raises(ValueError, match="country-qualified location"):
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


def test_failure_grounding_diagnostics_are_bounded_and_secret_free():
    diagnostics = HybridRunService._sanitized_grounding_diagnostics(
        {
            "routing_diagnostics": {
                "required_evidence_classes": ["official_statistic"],
                "providers": [
                    {
                        "provider": "searxng:official_statistic",
                        "evidence_class": "official_statistic",
                        "query_id": "query-safe",
                        "reason": "https://internal/?token=secret",
                        "provider_error": "TimeoutException",
                        "runtime": {
                            "route": "searxng",
                            "status": "empty",
                            "elapsed_ms": 1500,
                            "call_count": 1,
                            "unresponsive_engines": [
                                {
                                    "engine": "brave<script>",
                                    "reason": "suspended https://internal/?token=secret",
                                }
                            ],
                        },
                    }
                ],
                "attempted_sources": [
                    {
                        "retrieval_host": "vertexaisearch.cloud.google.com",
                        "final_host": "stat.ee",
                        "acquisition_evidence_classes": ["official_statistic"],
                        "direct_fetch_status": "retrieved",
                        "jurisdiction_binding_status": "verified",
                        "authority_verification_status": "unverified",
                    }
                ],
                "evidence_class_acquisition": {
                    "official_statistic": {
                        "attempted": 2,
                        "retrieved": 1,
                        "verified": 0,
                    }
                },
                "targeted_authority_attestation": {
                    "status": "mixed",
                    "cell_count": 3,
                    "host_count": 6,
                    "route_count": 12,
                    "candidate_count": 3,
                    "elapsed_ms": 25,
                    "deadline_ms": 90_000,
                },
                "statutory_recovery": {
                    "status": "completed",
                    "route_count": 1,
                    "candidate_count": 2,
                    "retrieved_count": 2,
                    "verified_count": 1,
                    "accepted_verified_claims": 0,
                    "elapsed_ms": 20_000,
                    "deadline_ms": 90_000,
                },
            },
            "market_sources": [],
            "critical_claim_quality": {
                "status": "blocked",
                "verified_claim_classes": [],
                "missing_claim_classes": ["official_statistic"],
                "mandatory_claim_classes": ["official_statistic"],
                "blocked_claims": [
                    {
                        "claim_id": "stat-1",
                        "reason": "material_fact_not_extractable",
                    },
                    {
                        "claim_id": "",
                        "reason": "mandatory_claim_class_missing:official_statistic",
                    },
                ],
                "candidate_rejection_counts": {
                    "material_fact_not_extractable": 21,
                },
                "quarantined_count": 21,
            },
        }
    )

    serialized = str(diagnostics).casefold()
    assert "secret" not in serialized
    assert "http" not in serialized
    assert diagnostics["providers"][0]["runtime"]["unresponsive_engines"] == [
        {"engine": "bravescript", "reason_code": "suspended"}
    ]
    assert diagnostics["attempted_sources"][0]["final_host"] == "stat.ee"
    assert diagnostics["evidence_class_acquisition"]["official_statistic"] == {
        "attempted": 2,
        "retrieved": 1,
        "verified": 0,
    }
    assert diagnostics["targeted_authority_attestation"] == {
        "status": "mixed",
        "cell_count": 3,
        "host_count": 6,
        "route_count": 12,
        "candidate_count": 3,
        "elapsed_ms": 25,
        "deadline_ms": 90_000,
    }
    assert diagnostics["statutory_recovery"] == {
        "status": "completed",
        "route_count": 1,
        "candidate_count": 2,
        "retrieved_count": 2,
        "verified_count": 1,
        "accepted_verified_claims": 0,
        "elapsed_ms": 20_000,
        "deadline_ms": 90_000,
    }
    assert diagnostics["verified_claim_classes"] == []
    assert diagnostics["missing_claim_classes"] == ["official_statistic"]
    assert diagnostics["blocked_reason_counts"] == {
        "mandatory_claim_class_missing": 1,
        "material_fact_not_extractable": 1,
    }
    assert diagnostics["candidate_rejection_counts"] == {
        "material_fact_not_extractable": 21,
    }
    assert diagnostics["quarantined_count"] == 21


def test_multi_market_critical_gate_requires_every_class_in_every_country_cell(
    monkeypatch,
):
    classes = {
        "country:BE": ["statutory_current"],
        "country:NL": ["official_statistic"],
        "country:LU": ["observed_primary_market"],
    }

    def grounding_for(cell_classes):
        sources = []
        claims = []
        for cell_id, evidence_classes in cell_classes.items():
            for index, evidence_class in enumerate(evidence_classes):
                source_id = f"source-{cell_id}-{index}"
                sources.append(
                    {"source_id": source_id, "research_cell_ids": [cell_id]}
                )
                claims.append(
                    {
                        "claim_id": f"claim-{cell_id}-{index}",
                        "source_ids": [source_id],
                        "research_cell_ids": [cell_id],
                        "evidence_class": evidence_class,
                    }
                )
        return {
            "market_sources": sources,
            "market_claims": claims,
            "cell_coverage": [
                {
                    "cell_id": cell_id,
                    "country_codes": [cell_id.split(":", 1)[1]],
                    "status": "complete",
                }
                for cell_id in cell_classes
            ],
        }

    required = {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }

    def fake_quality(cell_grounding, _countries, **_kwargs):
        verified = {
            row["evidence_class"] for row in cell_grounding["market_claims"]
        }
        missing = sorted(required - verified)
        return {
            "status": "blocked" if missing else "passed",
            "verified_claim_classes": sorted(verified),
            "missing_claim_classes": missing,
            "blocked_claims": [
                {
                    "reason": f"mandatory_claim_class_missing:{value}",
                }
                for value in missing
            ],
        }

    monkeypatch.setattr(
        "backend.services.orqaly_hybrid_run_service.evaluate_critical_claims",
        fake_quality,
    )
    distributed = grounding_for(classes)
    rows = HybridRunService._evaluate_country_cell_claims(
        distributed,
        critical_policy={"mandatory_claim_classes": sorted(required)},
        claim_class_applicability={
            "applicable_claim_classes": sorted(required)
        },
    )
    assert all(row["status"] == "blocked" for row in rows)
    assert all(row["missing_claim_classes"] for row in rows)
    assert all(row["status"] == "blocked" for row in distributed["cell_coverage"])

    complete = grounding_for(
        {cell_id: sorted(required) for cell_id in classes}
    )
    rows = HybridRunService._evaluate_country_cell_claims(
        complete,
        critical_policy={"mandatory_claim_classes": sorted(required)},
        claim_class_applicability={
            "applicable_claim_classes": sorted(required)
        },
    )
    assert all(row["status"] == "passed" for row in rows)
    assert all(not row["missing_claim_classes"] for row in rows)
    assert all(row["status"] == "complete" for row in complete["cell_coverage"])


def test_country_cell_gate_recovers_verified_country_join_when_cell_tag_missing(
    monkeypatch,
):
    """A legacy/deferred row may carry EE but miss the transport-only cell tag.

    The source-country proof remains the trust boundary. The fallback is used
    only for rows without any cell IDs and never lets one tagged cell bleed
    into another.
    """

    observed = {}

    def fake_quality(cell_grounding, countries, **_kwargs):
        observed["sources"] = cell_grounding["market_sources"]
        observed["claims"] = cell_grounding["market_claims"]
        observed["countries"] = countries
        return {
            "status": "passed",
            "verified_claim_classes": ["statutory_current"],
            "missing_claim_classes": [],
            "blocked_claims": [],
        }

    monkeypatch.setattr(
        "backend.services.orqaly_hybrid_run_service.evaluate_critical_claims",
        fake_quality,
    )
    grounding = {
        "market_sources": [
            {"source_id": "source-ee", "country_codes": ["EE"]},
            {
                "source_id": "source-be",
                "country_codes": ["BE"],
                "research_cell_ids": ["country:BE"],
            },
        ],
        "market_claims": [
            {
                "claim_id": "claim-ee",
                "source_ids": ["source-ee"],
                "country_codes": ["EE"],
            },
            {
                "claim_id": "claim-be",
                "source_ids": ["source-be"],
                "country_codes": ["BE"],
                "research_cell_ids": ["country:BE"],
            },
        ],
        "cell_coverage": [
            {
                "cell_id": "country:EE",
                "country_codes": ["EE"],
                "status": "complete",
            }
        ],
    }

    rows = HybridRunService._evaluate_country_cell_claims(
        grounding,
        critical_policy={
            "mandatory_claim_classes": ["statutory_current"]
        },
        claim_class_applicability={
            "applicable_claim_classes": ["statutory_current"]
        },
    )

    assert rows[0]["status"] == "passed"
    assert [row["source_id"] for row in observed["sources"]] == ["source-ee"]
    assert [row["claim_id"] for row in observed["claims"]] == ["claim-ee"]
    assert observed["countries"] == ["EE"]


def test_terminal_run_performance_is_frozen_at_completed_at():
    run = PipelineRun(
        job_id="job-frozen",
        simulation_id="sim-frozen",
        status="failed",
        current_stage="failed",
        progress_percentage=4,
        pipeline_mode="hybrid_a_plus_b",
        request_id="req-frozen",
        attempt_count=1,
        created_at=datetime(2026, 8, 13, 10, 0, tzinfo=timezone.utc),
        started_at=datetime(2026, 8, 13, 10, 0, tzinfo=timezone.utc),
        completed_at=datetime(2026, 8, 13, 10, 1, tzinfo=timezone.utc),
        execution_trace=[
            {
                "stage": "grounding_market",
                "progress_percentage": 3,
                "message": "grounding",
                "at": "2026-08-13T10:00:00+00:00",
                "duration_ms": None,
            }
        ],
    )
    first = HybridRunService.serialize_run(run)
    second = HybridRunService.serialize_run(run)
    assert first["elapsed_ms"] == second["elapsed_ms"]
    assert first["stage_trace"] == second["stage_trace"]
    assert first["stage_trace"][0]["duration_ms"] == 60_000
