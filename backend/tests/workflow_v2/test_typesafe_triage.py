"""Offline API-contract regressions; live requests require two explicit opt-ins."""

import asyncio
import json
import os
from types import SimpleNamespace

import httpx
import pytest

from backend.services.workflow_v2.cognitive import typesafe_triage as jev

pytestmark = pytest.mark.contract


@pytest.fixture
def mock_api(monkeypatch):
    calls = []
    config = {"scores": {}, "status": 200, "delay": 0}
    original = httpx.AsyncClient

    async def handle(request):
        calls.append(json.loads(request.content))
        if config["delay"]:
            await asyncio.sleep(config["delay"])
        questions = calls[-1]["questions"]
        return httpx.Response(
            config["status"],
            json={
                "answers": {
                    name: {"type": "noul", "noul": config["scores"].get(name, 1.0)}
                    for name in questions
                }
            },
        )

    monkeypatch.setattr(
        jev.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    monkeypatch.setenv("TYPESAFE_API_KEY", "offline-placeholder")
    return config, calls


def test_availability_requires_nonempty_environment(monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    assert not jev.is_typesafe_available()
    monkeypatch.setenv("TYPESAFE_API_KEY", " ")
    assert not jev.is_typesafe_available()
    monkeypatch.setenv("TYPESAFE_API_KEY", "offline-placeholder")
    assert jev.is_typesafe_available()


async def test_missing_key_never_evaluates(monkeypatch):
    monkeypatch.delenv("TYPESAFE_API_KEY", raising=False)
    docs = ["doc"]
    assert await jev.filter_documents_with_jev("query", docs) is docs
    assert await jev.classify_intent_with_jev(["Build an app"]) is None
    with pytest.raises(jev.QuickInfoRouteUnavailable):
        await jev.classify_quick_info_route("Latest score?")
    review = await jev.validate_deliverable_with_jev("draft")
    assert review.status == "not_evaluated"
    assert review.reason == "not_configured"
    assert review.decision is None


async def test_async_api_contract_and_complete_review_state(mock_api):
    config, calls = mock_api
    config["scores"] = {
        "has_unverified_commercial_or_financial_estimates_without_pending_prefix": 0.0
    }
    # Regression: previously discarded all input after 3500 chars and no criteria.
    markdown = "intro " * 700 + "UNVERIFIED_MARGIN_AT_END"
    review = await jev.validate_deliverable_with_jev(
        markdown,
        acceptance_criteria=[{"id": "margin", "then": "Label assumptions"}],
        evidence={"claim1": "A sourced fact"},
    )
    assert review.status == "passed"
    assert review.advisory is True
    assert calls[0]["state"]["deliverable"] == markdown
    assert calls[0]["state"]["acceptance_criteria"][0]["id"] == "margin"
    assert calls[0]["state"]["evidence"] == {"claim1": "A sourced fact"}
    assert calls[0]["model"] == "jev-latest"


@pytest.mark.parametrize(
    "scores",
    [
        {
            "has_unverified_commercial_or_financial_estimates_without_pending_prefix": 1.0
        },
        {
            "has_unverified_commercial_or_financial_estimates_without_pending_prefix": 0.0,
            "is_acceptance_criteria_traceability_intact": 0.0,
        },
    ],
)
async def test_rejection_is_explicit_not_verified(mock_api, scores):
    config, _ = mock_api
    config["scores"] = scores
    result = await jev.validate_deliverable_with_jev(
        "draft", acceptance_criteria=["criterion"], evidence={"claim": "fact"}
    )
    assert result.status == "failed"
    assert result.advisory is True


@pytest.mark.parametrize(
    "scores",
    [
        {"is_acceptance_criteria_traceability_intact": 0.5},
        {"is_acceptance_criteria_traceability_intact": True},
        {"is_acceptance_criteria_traceability_intact": "1"},
        {"is_acceptance_criteria_traceability_intact": 2},
    ],
)
async def test_uncertain_or_malformed_answers_never_pass(mock_api, scores):
    config, _ = mock_api
    config["scores"] = scores
    result = await jev.validate_deliverable_with_jev(
        "draft", acceptance_criteria=["criterion"], evidence={"claim": "fact"}
    )
    assert result.status == "not_evaluated"
    assert result.decision is None


async def test_incomplete_and_oversized_reviews_are_not_sent(mock_api):
    _, calls = mock_api
    missing = await jev.validate_deliverable_with_jev("draft")
    oversized = await jev.validate_deliverable_with_jev(
        "x" * 50_000, acceptance_criteria=["criterion"], evidence={"claim": "fact"}
    )
    assert missing.reason == "missing_evidence_or_criteria"
    assert oversized.reason == "input_too_large"
    assert calls == []


async def test_timeout_is_bounded_and_preserves_evidence(mock_api):
    config, calls = mock_api
    config["delay"] = 0.2
    docs = [SimpleNamespace(text="evidence")]
    assert (
        await jev.filter_documents_with_jev("query", docs, timeout_seconds=0.01) is docs
    )
    result = await jev.validate_deliverable_with_jev(
        "draft",
        acceptance_criteria=["criterion"],
        evidence={"claim": "fact"},
        timeout_seconds=0.01,
    )
    assert result.status == "not_evaluated"
    assert result.reason == "provider_unavailable"
    assert len(calls) == 2


async def test_provider_error_preserves_documents(mock_api):
    config, _ = mock_api
    config["status"] = 503
    docs = [SimpleNamespace(text="evidence")]
    assert await jev.filter_documents_with_jev("query", docs) is docs
    assert await jev.classify_intent_with_jev(["Build an app"]) is None
    with pytest.raises(jev.QuickInfoRouteUnavailable):
        await jev.classify_quick_info_route("Latest score?")


async def test_quick_info_choice_uses_official_closed_set_contract(monkeypatch):
    calls = []
    original = httpx.AsyncClient

    async def handle(request):
        calls.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "model": "jev-1.13.0",
                "answers": {
                    "route": {
                        "type": "choice",
                        "choice": "quick_info",
                        "confidence": 0.91,
                        "probabilities": {
                            "quick_info": 0.86,
                            "research": 0.08,
                            "local_engineering": 0.02,
                            "conversation": 0.04,
                        },
                    }
                },
                "usage": {"input_tokens": 392, "output_tokens": 65},
            },
        )

    monkeypatch.setattr(
        jev.httpx,
        "AsyncClient",
        lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs),
    )
    monkeypatch.setenv("TYPESAFE_API_KEY", "offline-placeholder")

    result = await jev.classify_quick_info_route(
        "What time does IKEA Bremen close today?", "Bremen"
    )

    assert result is not None and result.confidently_quick_info
    assert calls == [
        {
            "model": "jev-latest",
            "state": {
                "message": "What time does IKEA Bremen close today?",
                "hasProjectContext": False,
                "location": "Bremen",
            },
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": (
                        "Choose the single safest handling lane for this user request."
                    ),
                    "criteria": calls[0]["questions"]["route"]["criteria"],
                }
            },
        }
    ]
    assert set(calls[0]["questions"]["route"]["criteria"]) == {
        "quick_info",
        "research",
        "local_engineering",
        "conversation",
    }


async def test_quick_info_choice_rejects_malformed_probabilities(mock_api):
    config, _calls = mock_api
    # The generic Noul mock is deliberately not a valid Choice response.
    config["scores"] = {}
    with pytest.raises(jev.QuickInfoRouteUnavailable):
        await jev.classify_quick_info_route("Latest score?")


async def test_configured_review_status_is_visible_without_pass_certificate(mock_api):
    config, _ = mock_api
    config["scores"] = {"is_acceptance_criteria_traceability_intact": 0.0}
    context = SimpleNamespace(
        accepted_acceptance_criteria=[
            SimpleNamespace(model_dump=lambda **kwargs: {"id": "acc1"})
        ],
        allowed_claim_texts={"claim": "fact"},
        required_gap_labels=[],
        unresolved_evidence_requirements=[],
    )
    output = await jev.append_jev_advisory("draft", context)
    assert "found issues requiring review" in output
    assert "does not certify correctness or authorize adoption" in output


@pytest.mark.live
@pytest.mark.llm
async def test_live_typesafe_injected_credentials_only():
    if (
        os.getenv("AXWISE_RUN_LIVE_TYPESAFE_TESTS") != "1"
        or not jev.is_typesafe_available()
    ):
        pytest.skip(
            "Set AXWISE_RUN_LIVE_TYPESAFE_TESTS=1 and inject TYPESAFE_API_KEY for a real provider request"
        )
    # Non-private synthetic input. No hidden credential fallback, latency claim,
    # or alleged system E2E coverage from this isolated provider contract check.
    result = await jev._evaluate(
        {"goals": ["Build a Rust web API"]}, jev.GoalIntentDecision
    )
    assert result.is_software_product
