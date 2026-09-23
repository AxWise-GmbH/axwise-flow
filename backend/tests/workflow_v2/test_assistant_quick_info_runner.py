from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.domain.workflow_v2.contracts import AssistantTurnInputV2
from backend.services.workflow_v2.assistant.quick_info_runner import (
    AssistantQuickInfoError,
    GeminiAssistantQuickInfoRunner,
)
from backend.services.workflow_v2.cognitive.typesafe_triage import (
    QuickInfoRouteDecision,
    QuickInfoRouteUnavailable,
)


pytestmark = pytest.mark.contract


def decision(
    route="quick_info", *, confidence=0.9, quick_info=0.9
) -> QuickInfoRouteDecision:
    remaining = 1 - quick_info
    return QuickInfoRouteDecision(
        route=route,
        confidence=confidence,
        probabilities={
            "quick_info": quick_info,
            "research": remaining,
            "local_engineering": 0,
            "conversation": 0,
        },
        model="jev-1.13.0",
    )


def response(*, source=True, url="https://www.ikea.com/de/en/stores/bremen/"):
    text = "IKEA Bremen closes at 8:00 PM today."
    annotations = []
    if source:
        annotations.append(
            SimpleNamespace(
                type="url_citation",
                url=url,
                title="IKEA Bremen",
                start_index=0,
                end_index=len(text.encode("utf-8")),
            )
        )
    return SimpleNamespace(
        model="gemini-3.8-flash-001",
        output_text=text,
        usage=SimpleNamespace(total_input_tokens=12, total_output_tokens=7),
        steps=[
            SimpleNamespace(
                type="google_search_call",
                arguments=SimpleNamespace(queries=["IKEA Bremen hours today"]),
            ),
            SimpleNamespace(
                type="model_output",
                content=[
                    SimpleNamespace(
                        type="text", text=text, annotations=annotations
                    )
                ],
            ),
        ],
    )


def client_with(create):
    return SimpleNamespace(
        aio=SimpleNamespace(interactions=SimpleNamespace(create=create))
    )


def test_quick_info_contract_uses_message_and_explicit_routing_mode():
    parsed = AssistantTurnInputV2.model_validate(
        {
            "type": "AssistantTurnV2",
            "responseMode": "one_shot",
            "message": "When does IKEA Bremen close today?",
            "conversation": [],
            "capability": {
                "kind": "quick_info",
                "location": "Bremen",
                "routingMode": "jev",
            },
        }
    )
    assert parsed.capability.kind == "quick_info"
    assert parsed.capability.routing_mode == "jev"
    with pytest.raises(ValueError):
        AssistantTurnInputV2.model_validate(
            {
                "type": "AssistantTurnV2",
                "responseMode": "one_shot",
                "message": "x" * 2001,
                "conversation": [],
                "capability": {"kind": "quick_info", "routingMode": "explicit"},
            }
        )


@pytest.mark.asyncio
async def test_jev_and_one_low_thinking_search_start_concurrently_and_cache():
    classifier_started = asyncio.Event()
    search_started = asyncio.Event()

    async def classify(_query, _location):
        classifier_started.set()
        await asyncio.wait_for(search_started.wait(), timeout=0.2)
        return decision()

    async def create(**kwargs):
        search_started.set()
        await asyncio.wait_for(classifier_started.wait(), timeout=0.2)
        return response()

    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(create), route_classifier=classify
    )
    first = await runner.quick_info(
        "When does IKEA Bremen close today?",
        location="Bremen",
        jev_enabled=True,
    )
    second = await runner.quick_info(
        " When does IKEA Bremen close today? ",
        location=" Bremen ",
        jev_enabled=True,
    )

    assert first.markdown == (
        "IKEA Bremen closes at 8:00 PM today. — "
        "[IKEA Bremen](<https://www.ikea.com/de/en/stores/bremen/>)"
    )
    assert first.facts[0].source_urls == (
        "https://www.ikea.com/de/en/stores/bremen/",
    )
    assert first.input_tokens == 12 and first.output_tokens == 7
    assert first.search_calls == 1
    assert second.cache_hit is True
    assert second.input_tokens == 0 and second.search_calls == 0


@pytest.mark.asyncio
async def test_local_headlines_keep_three_exact_fact_source_pairs():
    statements = [
        "The port published a new notice.",
        "Bremen transit announced a route change.",
        "The city council published an agenda.",
        "A fourth item must be omitted.",
    ]
    urls = [f"https://example.com/story-{index}" for index in range(4)]
    titles = ["Port", "Transit [Bremen]", "City council", "Fourth source"]
    output = "\n".join(statements)
    annotations = []
    for statement, url, title in zip(statements, urls, titles):
        start = output.encode("utf-8").index(statement.encode("utf-8"))
        annotations.append(
            SimpleNamespace(
                type="url_citation",
                url=url,
                title=title,
                start_index=start,
                end_index=start + len(statement.encode("utf-8")),
            )
        )
    grounded = SimpleNamespace(
        model="gemini-3.8-flash-001",
        output_text=output,
        usage=SimpleNamespace(total_input_tokens=12, total_output_tokens=30),
        steps=[
            SimpleNamespace(type="google_search_call", arguments=SimpleNamespace(queries=["Bremen news"])),
            SimpleNamespace(type="model_output", content=[SimpleNamespace(type="text", text=output, annotations=annotations)]),
        ],
    )
    runner = GeminiAssistantQuickInfoRunner(client=client_with(AsyncMock(return_value=grounded)))

    result = await runner.quick_info(
        "What are the latest local headlines in Bremen? Give me 3 short bullets with source links.",
        location="Bremen",
        jev_enabled=False,
    )

    assert result.markdown.splitlines() == [
        "- The port published a new notice. — [Port](<https://example.com/story-0>)",
        "- Bremen transit announced a route change. — [Transit \\[Bremen\\]](<https://example.com/story-1>)",
        "- The city council published an agenda. — [City council](<https://example.com/story-2>)",
    ]
    assert [fact.source_urls for fact in result.facts] == [(url,) for url in urls[:3]]
    assert [source.url for source in result.sources] == sorted(urls[:3])


@pytest.mark.asyncio
async def test_explicit_benchmark_mode_skips_jev_and_uses_exact_interaction_args():
    create = AsyncMock(return_value=response())
    classify = AsyncMock(side_effect=AssertionError("JEV must be skipped"))
    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(create), route_classifier=classify
    )

    await runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)

    classify.assert_not_awaited()
    assert create.await_count == 1
    request = create.await_args.kwargs
    assert request["model"] == "gemini-3.8-flash"
    assert request["tools"] == [{"type": "google_search"}]
    assert request["generation_config"] == {"thinking_level": "low"}
    assert request["store"] is False


@pytest.mark.asyncio
async def test_concurrent_identical_requests_share_one_search():
    release = asyncio.Event()
    calls = 0

    async def create(**_kwargs):
        nonlocal calls
        calls += 1
        await release.wait()
        return response()

    runner = GeminiAssistantQuickInfoRunner(client=client_with(create))
    first = asyncio.create_task(
        runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)
    )
    second = asyncio.create_task(
        runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)
    )
    await asyncio.sleep(0)
    release.set()
    results = await asyncio.gather(first, second)

    assert calls == 1
    assert sorted(result.cache_hit for result in results) == [False, True]
    assert sorted(result.search_calls for result in results) == [0, 1]


@pytest.mark.asyncio
async def test_cancelling_one_quick_waiter_preserves_shared_search():
    started = asyncio.Event()
    release = asyncio.Event()
    cancelled = asyncio.Event()

    async def create(**_kwargs):
        started.set()
        try:
            await release.wait()
            return response()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    runner = GeminiAssistantQuickInfoRunner(client=client_with(create))
    first = asyncio.create_task(
        runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)
    )
    second = asyncio.create_task(
        runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)
    )
    await started.wait()
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert not cancelled.is_set()
    release.set()
    result = await second
    assert result.search_calls == 0
    assert result.cache_hit is True
    assert not cancelled.is_set()


@pytest.mark.asyncio
async def test_cancelling_last_quick_waiter_cancels_search():
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def create(**_kwargs):
        started.set()
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    runner = GeminiAssistantQuickInfoRunner(client=client_with(create))
    waiter = asyncio.create_task(
        runner.quick_info("Latest Werder score?", location=None, jev_enabled=False)
    )
    await started.wait()
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_non_quick_route_cancels_search_and_is_non_retryable():
    search_started = asyncio.Event()
    cancelled = asyncio.Event()

    async def create(**_kwargs):
        search_started.set()
        try:
            await asyncio.sleep(10)
        finally:
            cancelled.set()

    async def classify(_query, _location):
        await search_started.wait()
        return decision("research", quick_info=0.1)

    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(create), route_classifier=classify
    )
    with pytest.raises(AssistantQuickInfoError) as error:
        await runner.quick_info("Compare five phones", location=None, jev_enabled=True)

    assert error.value.code == "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_MISMATCH"
    assert error.value.retryable is False
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_unavailable_jev_is_retryable_without_fallback():
    create = AsyncMock(return_value=response())
    classify = AsyncMock(side_effect=QuickInfoRouteUnavailable("provider_unavailable"))
    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(create), route_classifier=classify
    )
    with pytest.raises(AssistantQuickInfoError) as error:
        await runner.quick_info("Latest score?", location=None, jev_enabled=True)
    assert error.value.code == "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNAVAILABLE"
    assert error.value.retryable is True


@pytest.mark.asyncio
async def test_low_confidence_jev_is_non_retryable_uncertainty():
    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(AsyncMock(return_value=response())),
        route_classifier=AsyncMock(return_value=decision(confidence=0.6)),
    )
    with pytest.raises(AssistantQuickInfoError) as error:
        await runner.quick_info("Latest score?", location=None, jev_enabled=True)
    assert error.value.code == "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNCERTAIN"
    assert error.value.retryable is False


@pytest.mark.asyncio
async def test_uncited_output_is_never_published():
    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(AsyncMock(return_value=response(source=False))),
        route_classifier=AsyncMock(return_value=decision()),
    )
    with pytest.raises(AssistantQuickInfoError) as error:
        await runner.quick_info("Latest score?", location=None, jev_enabled=True)
    assert error.value.code == "AXWISE_ASSISTANT_QUICK_INFO_UNGROUNDED"
    assert error.value.retryable is True


@pytest.mark.asyncio
async def test_private_citation_is_never_published():
    runner = GeminiAssistantQuickInfoRunner(
        client=client_with(
            AsyncMock(return_value=response(url="https://127.0.0.1/private"))
        ),
        route_classifier=AsyncMock(return_value=decision()),
    )
    with pytest.raises(AssistantQuickInfoError) as error:
        await runner.quick_info("Latest score?", location=None, jev_enabled=True)
    assert error.value.code == "AXWISE_ASSISTANT_QUICK_INFO_UNGROUNDED"
