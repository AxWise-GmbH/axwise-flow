import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

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
from backend.api.research.simulation_bridge.services.cognition_contracts import (
    CognitionStageTimeoutError,
    IncompleteSimulationCohortError,
)
from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)


pytestmark = pytest.mark.contract


def _request(*, people_per_stakeholder: int = 1) -> SimulationRequest:
    return SimulationRequest(
        business_context=BusinessContext(
            business_idea="Evidence-backed workflow research",
            target_customer="Research teams",
            problem="Incomplete interviews create misleading conclusions",
        ),
        questions_data=QuestionsData(
            stakeholders={
                "primary": [
                    Stakeholder(
                        id="lead",
                        name="Research Lead",
                        description="Owns research quality",
                        questions=["What evidence do you require?"],
                    )
                ]
            }
        ),
        config=SimulationConfig(
            people_per_stakeholder=people_per_stakeholder,
        ),
    )


def _person(person_id: str, *, stakeholder_type: str = "Research Lead") -> SimulatedPerson:
    return SimulatedPerson(
        id=person_id,
        name=f"Person {person_id}",
        age=38,
        background="Leads evidence-based research and purchasing decisions.",
        motivations=["Make reliable decisions"],
        pain_points=["Incomplete evidence"],
        communication_style="Direct and specific",
        stakeholder_type=stakeholder_type,
        demographic_details=DemographicDetails(),
    )


def _interview(person_id: str) -> SimulatedInterview:
    question = "What evidence do you require?"
    return SimulatedInterview(
        person_id=person_id,
        stakeholder_type="Research Lead",
        responses=[
            InterviewResponse(
                question=question,
                response="I require traceable evidence before recommending a decision.",
                sentiment="neutral",
                key_insights=["Evidence must be traceable"],
            )
        ],
        interview_duration_minutes=10,
        overall_sentiment="neutral",
        key_themes=["traceability"],
    )


def _bare_orchestrator() -> SimulationOrchestrator:
    orchestrator = SimulationOrchestrator.__new__(SimulationOrchestrator)
    orchestrator.active_simulations = {}
    orchestrator.completed_simulations = {}
    orchestrator.callbacks = {}
    orchestrator.use_parallel = False
    orchestrator.parallel_interview_simulator = None
    orchestrator._update_progress = AsyncMock()
    orchestrator._update_progress_with_counts = AsyncMock()
    orchestrator._fire_callback = AsyncMock()
    return orchestrator


def test_persona_cohort_requires_the_planned_stakeholder_population() -> None:
    orchestrator = _bare_orchestrator()
    request = _request(people_per_stakeholder=2)

    with pytest.raises(IncompleteSimulationCohortError, match="planned=.*2"):
        orchestrator._validate_persona_cohort(request, [_person("person-1")])

    orchestrator._validate_persona_cohort(
        request,
        [_person("person-1"), _person("person-2")],
    )


def test_interview_cohort_requires_exactly_one_interview_per_person() -> None:
    people = [_person("person-1"), _person("person-2")]

    with pytest.raises(IncompleteSimulationCohortError, match="missing_person_ids"):
        SimulationOrchestrator._validate_interview_cohort(
            people,
            [_interview("person-1"), _interview("person-1")],
        )

    SimulationOrchestrator._validate_interview_cohort(
        people,
        [_interview("person-1"), _interview("person-2")],
    )


@pytest.mark.asyncio
async def test_cognition_deadline_bounds_the_whole_stage_and_cancels_work(
    monkeypatch,
) -> None:
    monkeypatch.setenv("AXWISE_PERSONA_STAGE_TIMEOUT_SECONDS", "0.01")
    orchestrator = _bare_orchestrator()
    cancelled = asyncio.Event()

    async def blocked_stage() -> None:
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    with pytest.raises(CognitionStageTimeoutError, match="personas cognition stage"):
        await orchestrator._run_cognition_stage("personas", blocked_stage)

    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_run_simulation_never_publishes_a_partial_persona_cohort() -> None:
    orchestrator = _bare_orchestrator()
    orchestrator.persona_generator = SimpleNamespace(
        generate_all_personas=AsyncMock(return_value=[_person("person-1")])
    )
    orchestrator.interview_simulator = SimpleNamespace(
        simulate_all_interviews=AsyncMock()
    )

    result = await orchestrator.run_simulation(
        _request(people_per_stakeholder=2)
    )

    assert result.success is False
    assert "Persona cohort incomplete" in result.message
    orchestrator.interview_simulator.simulate_all_interviews.assert_not_awaited()
    assert orchestrator.completed_simulations == {}


@pytest.mark.asyncio
async def test_run_simulation_never_publishes_a_partial_interview_cohort() -> None:
    orchestrator = _bare_orchestrator()
    orchestrator.persona_generator = SimpleNamespace(
        generate_all_personas=AsyncMock(return_value=[_person("person-1")])
    )
    orchestrator.interview_simulator = SimpleNamespace(
        simulate_all_interviews=AsyncMock(return_value=[])
    )

    result = await orchestrator.run_simulation(_request())

    assert result.success is False
    assert "Interview cohort incomplete" in result.message
    assert orchestrator.completed_simulations == {}


@pytest.mark.asyncio
async def test_hybrid_finalization_rechecks_cohort_before_publication() -> None:
    orchestrator = _bare_orchestrator()
    result = SimulationResponse(
        success=True,
        message="Pipeline B complete",
        simulation_id="simulation-1",
        metadata={"planned_personas": 2},
        people=[_person("person-1")],
        interviews=[_interview("person-1")],
    )

    with pytest.raises(
        IncompleteSimulationCohortError,
        match="Hybrid persona cohort incomplete",
    ):
        await orchestrator.finalize_hybrid_simulation(result)

    orchestrator._update_progress.assert_not_awaited()
    assert orchestrator.completed_simulations == {}
