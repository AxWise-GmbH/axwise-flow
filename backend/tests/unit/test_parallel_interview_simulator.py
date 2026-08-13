from types import SimpleNamespace

import pytest

from backend.api.research.simulation_bridge.models import (
    BusinessContext,
    DemographicDetails,
    InterviewResponse,
    SimulatedInterview,
    SimulatedPerson,
    SimulationConfig,
    Stakeholder,
)
from backend.api.research.simulation_bridge.services.parallel_interview_simulator import (
    ParallelInterviewSimulator,
)


pytestmark = pytest.mark.contract


class _SuccessfulInterviewAgent:
    def __init__(self) -> None:
        self.calls = 0

    async def run(self, _prompt: str, *, deps):
        self.calls += 1
        question = deps.questions[0]
        return SimpleNamespace(
            output=SimulatedInterview(
                person_id="model-placeholder",
                stakeholder_type="model-placeholder",
                responses=[
                    InterviewResponse(
                        question=question,
                        response=(
                            "I need a dependable workflow with traceable evidence before "
                            "I can recommend this product to my team."
                        ),
                        sentiment="neutral",
                        key_insights=["Traceable evidence is required"],
                    )
                ],
                interview_duration_minutes=0,
                overall_sentiment="neutral",
                key_themes=["evidence"],
            )
        )


def test_parallel_simulator_calculates_duration_after_native_output(
    monkeypatch,
) -> None:
    simulator = ParallelInterviewSimulator(model=None)
    monkeypatch.setattr(
        "backend.api.research.simulation_bridge.services."
        "parallel_interview_simulator.random.randint",
        lambda _minimum, _maximum: 4,
    )
    responses = [
        InterviewResponse(
            question="What evidence would you need before buying?",
            response="I need independently traceable evidence before deciding.",
            sentiment="neutral",
            key_insights=["Traceability matters"],
        )
        for _ in range(2)
    ]

    assert simulator._calculate_duration(responses) == 10


@pytest.mark.asyncio
async def test_parallel_simulator_retains_every_successfully_parsed_interview() -> None:
    simulator = ParallelInterviewSimulator(model=None, max_concurrent=6)
    agent = _SuccessfulInterviewAgent()
    simulator.agent = agent

    stakeholders = {
        "primary": [
            Stakeholder(
                id=f"stakeholder-{index}",
                name=f"Stakeholder {index}",
                description="Owns a purchase decision.",
                questions=["What evidence would you need before buying?"],
            )
            for index in range(6)
        ]
    }
    people = [
        SimulatedPerson(
            id=f"person-{index}",
            name=f"Person {index}",
            age=30 + index,
            background="Evaluates products for a small business.",
            motivations=["Make a reliable decision"],
            pain_points=["Unverifiable claims"],
            communication_style="direct",
            stakeholder_type=f"Stakeholder {index}",
            demographic_details=DemographicDetails(),
        )
        for index in range(6)
    ]
    progress = []

    interviews = await simulator.simulate_all_interviews_parallel(
        people,
        stakeholders,
        BusinessContext(
            business_idea="Evidence-backed product research",
            target_customer="Small businesses",
            problem="Purchase evidence is difficult to verify",
        ),
        SimulationConfig(people_per_stakeholder=1),
        progress_callback=lambda message, completed, total, failed: progress.append(
            (message, completed, total, failed)
        ),
    )

    assert agent.calls == 6
    assert len(interviews) == 6
    assert [interview.person_id for interview in interviews] == [
        person.id for person in people
    ]
    assert [interview.stakeholder_type for interview in interviews] == [
        person.stakeholder_type for person in people
    ]
    assert all(interview.interview_duration_minutes >= 10 for interview in interviews)
    assert progress[-1][1:] == (6, 6, 0)
