import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError
from pydantic_ai import ModelRetry

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    CompanyDiscoveryItem,
    DemographicDetails,
    InterviewResponse,
    PersonaGenerationItem,
    RegionalWorkflowRequest,
    SimulatedInterview,
    SimulatedPerson,
    SimulationInsights,
    Stakeholder,
)
from backend.api.research.simulation_bridge.services.cognition_contracts import (
    CognitionStageTimeoutError,
    IncompleteSimulationCohortError,
)
from backend.api.research.simulation_bridge.services.persona_generator import (
    PersonaGenerator,
)
from backend.api.research.simulation_bridge.services.regional_service import (
    RegionalInsightsOutput,
    RegionalInsightsRunContract,
    RegionalService,
)
from backend.api.research.simulation_bridge.services import (
    regional_service as regional_service_module,
)


pytestmark = pytest.mark.contract


def _company() -> CompanyDiscoveryItem:
    return CompanyDiscoveryItem(
        id="company-1",
        name="Grounded Research GmbH",
        industry="Research technology",
        size="25 employees",
        location="Bremen, Germany",
        latitude=53.0793,
        longitude=8.8017,
        decision_makers=["Research Lead"],
        estimated_pain_points=["Incomplete evidence"],
    )


def _request() -> RegionalWorkflowRequest:
    return RegionalWorkflowRequest(
        location="Bremen, Germany",
        business_problem="Incomplete evidence blocks reliable decisions",
        target_user="Research Lead",
        companies=[_company()],
    )


def _person(person_id: str = "person-1") -> SimulatedPerson:
    return SimulatedPerson(
        id=person_id,
        name="Alex Researcher",
        age=38,
        background="Leads evidence-backed purchasing research.",
        motivations=["Make reliable decisions"],
        pain_points=["Incomplete evidence"],
        communication_style="Direct and evidence-first",
        stakeholder_type="Research Lead",
        demographic_details=DemographicDetails(location="Bremen"),
        grounding_company="Grounded Research GmbH",
        grounding_company_id="company-1",
    )


def _interview(person_id: str = "person-1") -> SimulatedInterview:
    return SimulatedInterview(
        person_id=person_id,
        stakeholder_type="Research Lead",
        responses=[
            InterviewResponse(
                question="What evidence do you require?",
                response="I require traceable evidence before I can approve a decision.",
                sentiment="neutral",
                key_insights=["Traceability is mandatory"],
            )
        ],
        interview_duration_minutes=10,
        overall_sentiment="neutral",
        key_themes=["traceability"],
    )


def _stakeholders():
    return {
        "primary": [
            Stakeholder(
                id="research-lead",
                name="Research Lead",
                description="Owns research quality",
                questions=["What evidence do you require?"],
            )
        ],
        "secondary": [],
    }


def _insights() -> SimulationInsights:
    return SimulationInsights(
        overall_sentiment="neutral",
        key_themes=["traceability"],
        stakeholder_priorities={"Research Lead": ["Traceability"]},
        potential_risks=["Evidence gaps"],
        opportunities=["Verifiable workflows"],
        recommendations=["Attach evidence to every conclusion"],
    )


def _patch_regional_stages(monkeypatch, *, people, interviews) -> None:
    persona_generator = SimpleNamespace(
        generate_personas_for_decision_makers=AsyncMock(return_value=people)
    )
    interview_simulator = SimpleNamespace(
        simulate_all_interviews=AsyncMock(return_value=interviews)
    )
    pin_service = SimpleNamespace(generate_pins_for_personas=AsyncMock())
    monkeypatch.setattr(
        "backend.api.research.simulation_bridge.services.regional_service.PersonaGenerator",
        lambda _model: persona_generator,
    )
    monkeypatch.setattr(
        "backend.api.research.simulation_bridge.services.regional_service.InterviewSimulator",
        lambda _model: interview_simulator,
    )
    monkeypatch.setattr(
        "backend.api.research.simulation_bridge.services.regional_service.PinImageService",
        lambda **_kwargs: pin_service,
    )


@pytest.mark.asyncio
async def test_regional_workflow_never_publishes_partial_interviews(
    monkeypatch,
) -> None:
    service = RegionalService(model=object())
    service._generate_stakeholders = AsyncMock(return_value=_stakeholders())
    service._aggregate_insights = AsyncMock(return_value=_insights())
    _patch_regional_stages(monkeypatch, people=[_person()], interviews=[])

    with pytest.raises(
        IncompleteSimulationCohortError,
        match="Regional interview cohort incomplete",
    ):
        await service.run_regional_workflow(_request(), user_id="user-1")


@pytest.mark.asyncio
async def test_regional_workflow_requires_persistence_before_success(
    monkeypatch,
) -> None:
    service = RegionalService(model=object())
    service._generate_stakeholders = AsyncMock(return_value=_stakeholders())
    service._aggregate_insights = AsyncMock(return_value=_insights())
    _patch_regional_stages(
        monkeypatch,
        people=[_person()],
        interviews=[_interview()],
    )

    class FailingUnitOfWork:
        def __init__(self, _session_factory):
            pass

        async def __aenter__(self):
            raise RuntimeError("database unavailable")

        async def __aexit__(self, *_args):
            return False

    monkeypatch.setattr(
        "backend.infrastructure.persistence.unit_of_work.UnitOfWork",
        FailingUnitOfWork,
    )

    with pytest.raises(RuntimeError, match="could not persist its cohort"):
        await service.run_regional_workflow(_request(), user_id="user-1")


@pytest.mark.asyncio
async def test_regional_workflow_does_not_publish_generic_insight_fallback(
    monkeypatch,
) -> None:
    service = RegionalService(model=object())
    service._generate_stakeholders = AsyncMock(return_value=_stakeholders())
    service._aggregate_insights = AsyncMock(
        side_effect=RuntimeError("validated synthesis failed")
    )
    _patch_regional_stages(
        monkeypatch,
        people=[_person()],
        interviews=[_interview()],
    )

    with pytest.raises(RuntimeError, match="validated synthesis failed"):
        await service.run_regional_workflow(_request(), user_id="user-1")


def test_regional_insight_schema_rejects_unbounded_or_thin_results() -> None:
    with pytest.raises(ValidationError):
        RegionalInsightsOutput(
            potential_risks=["Generic risk", "Another generic risk"],
            opportunities=["Generic opportunity", "Another generic opportunity"],
            recommendations=["Try something", "Try another thing", "Try a third thing"],
        )


@pytest.mark.asyncio
async def test_regional_insight_agent_uses_native_output_without_error_fallback(
    monkeypatch,
) -> None:
    captured = {}

    class FailingAgent:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def output_validator(self, function):
            captured["validator"] = function
            return function

        async def run(self, _prompt, *, deps):
            captured["deps"] = deps
            raise RuntimeError("structured synthesis failed")

    monkeypatch.setattr(regional_service_module, "Agent", FailingAgent)
    service = RegionalService(model=object())

    with pytest.raises(RuntimeError, match="structured synthesis failed"):
        await service._generate_llm_insights(
            ["[Research Lead] Q: Evidence? → Traceable evidence is mandatory"],
            BusinessContext(
                business_idea="Evidence workflows",
                target_customer="Research teams",
                problem="Incomplete evidence blocks reliable decisions",
            ),
            ["traceability"],
        )

    assert captured["retries"] == {"output": 2}
    assert type(captured["output_type"]).__name__ == "NativeOutput"
    assert "Traceable evidence" in captured["deps"].evidence_text

    unsupported = RegionalInsightsOutput(
        potential_risks=[
            "Agricultural weather volatility threatens seasonal crop forecasts.",
            "Maritime fuel prices could disrupt international shipping schedules.",
            "Hospital staffing shortages may reduce emergency room capacity.",
        ],
        opportunities=[
            "Satellite imagery could improve agricultural irrigation planning.",
            "Autonomous vessels may optimize transatlantic cargo operations.",
            "Clinical robotics could improve surgical recovery outcomes.",
        ],
        recommendations=[
            "Purchase crop insurance for every agricultural growing season.",
            "Replace cargo vessels with autonomous maritime equipment.",
            "Expand hospital staffing for clinical robotics operations.",
        ],
    )
    with pytest.raises(ModelRetry, match="Ground every risk"):
        await captured["validator"](
            SimpleNamespace(
                deps=RegionalInsightsRunContract(
                    evidence_text=captured["deps"].evidence_text
                )
            ),
            unsupported,
        )


@pytest.mark.asyncio
async def test_regional_persona_stage_uses_the_shared_deadline(monkeypatch) -> None:
    service = RegionalService(model=object())
    service._generate_stakeholders = AsyncMock(return_value=_stakeholders())
    monkeypatch.setenv("AXWISE_PERSONA_STAGE_TIMEOUT_SECONDS", "0.01")

    async def blocked_personas(**_kwargs):
        await asyncio.Event().wait()

    persona_generator = SimpleNamespace(
        generate_personas_for_decision_makers=blocked_personas
    )
    monkeypatch.setattr(
        "backend.api.research.simulation_bridge.services.regional_service.PersonaGenerator",
        lambda _model: persona_generator,
    )

    with pytest.raises(CognitionStageTimeoutError, match="personas cognition stage"):
        await service.run_regional_workflow(_request(), user_id="user-1")


@pytest.mark.asyncio
async def test_decision_maker_personas_bind_by_profile_index_not_output_order() -> None:
    generator = PersonaGenerator(model=None)

    def item(profile_index: int, name: str) -> PersonaGenerationItem:
        return PersonaGenerationItem(
            profile_index=profile_index,
            name=name,
            background="Owns a specific evidence-backed purchasing decision.",
            motivations=["Make a reliable choice", "Reduce decision risk"],
            pain_points=["Incomplete proof", "Unclear accountability"],
            communication_style="Direct, specific, and evidence-first",
            demographic_details=DemographicDetails(location="Bremen"),
            physical_description="a focused professional in business-casual clothing",
        )

    generator.agent = SimpleNamespace(
        run=AsyncMock(
            return_value=SimpleNamespace(
                output=[item(2, "Generated Two"), item(1, "Generated One")]
            )
        )
    )
    decision_makers = [
        {
            "name": "Ada One",
            "role": "Research Lead",
            "company_name": "Company One",
            "company_id": "company-1",
        },
        {
            "name": "Ben Two",
            "role": "Operations Lead",
            "company_name": "Company Two",
            "company_id": "company-2",
        },
    ]

    people = await generator.generate_personas_for_decision_makers(
        decision_makers,
        BusinessContext(
            business_idea="Evidence workflows",
            target_customer="Research teams",
            problem="Decisions lack traceable evidence",
            location="Bremen",
        ),
    )

    assert [person.name for person in people] == ["Ada One", "Ben Two"]
    assert [person.stakeholder_type for person in people] == [
        "Research Lead",
        "Operations Lead",
    ]
    assert [person.grounding_company_id for person in people] == [
        "company-1",
        "company-2",
    ]
