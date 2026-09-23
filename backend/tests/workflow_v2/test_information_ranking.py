import asyncio
from unittest.mock import AsyncMock
import pytest
from backend.services.workflow_v2.cognitive import information_ranking as ranking
from backend.services.workflow_v2.cognitive import typesafe_triage as triage
from backend.services.workflow_v2.assistant.service import AssistantTurnService
from backend.domain.workflow_v2.contracts import AssistantTurnInputV2

pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_ranking_is_bounded_stable_and_disabled_means_no_call(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-only")
    post = AsyncMock(
        return_value={
            "model": "jev-test",
            "answers": {
                "fit_0": {"type": "noul", "noul": 0.5},
                "fit_1": {"type": "noul", "noul": 0.9},
                "fit_2": {"type": "noul", "noul": 0.5},
            },
        }
    )
    monkeypatch.setattr(ranking, "_post_systemone", post)
    result = await ranking.rank_information(
        "rank jazz events", ["one", "two", "three"], enabled=False
    )
    assert result.order == (0, 1, 2)
    post.assert_not_awaited()
    result = await ranking.rank_information(
        "rank jazz events", ["one", "two", "three"], enabled=True
    )
    assert result.order == (1, 0, 2)
    assert (
        len(result.evidence_hash) == 64 and result.rubric == "public-candidate-fit-v1"
    )
    assert post.call_args.kwargs["timeout_seconds"] == 1.0
    post.return_value["answers"]["fit_0"]["noul"] = float("nan")
    assert (
        await ranking.rank_information("query", ["one", "two", "three"], enabled=True)
    ).status == "not_evaluated"


@pytest.mark.asyncio
async def test_request_jev_policy_is_isolated_and_restored(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-only")

    class Probe(AssistantTurnService):
        async def _execute_with_policy(self, request):
            await asyncio.sleep(0)
            return triage.is_typesafe_available()

    service = Probe(
        grounded_runner=None,
        conversational_runner=None,
        source_type_classifier=None,
        usage_reader=None,
        metrics_factory=None,
    )

    def request(enabled):
        return AssistantTurnInputV2(
            type="AssistantTurnV2",
            response_mode="direct_answer",
            message="test",
            capability={"kind": "text", "jevEnabled": enabled},
        )

    assert await asyncio.gather(
        service.execute(request(False)), service.execute(request(True))
    ) == [False, True]
    assert triage.is_typesafe_available()
