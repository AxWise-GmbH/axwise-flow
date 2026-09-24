from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.services.workflow_v2.assistant import widget_runner as widget_runner_module
from backend.services.workflow_v2.assistant.widget_runner import (
    AssistantWidgetError,
    CurrencyCandidate,
    GeminiAssistantWidgetRunner,
    WeatherCandidate,
)

pytestmark = pytest.mark.contract
NOW = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)


def _citation(
    text, fragment, *, url="https://example.com/current", title="Official source"
):
    start = text.encode("utf-8").find(fragment.encode("utf-8"))
    assert start >= 0
    return SimpleNamespace(
        type="url_citation",
        url=url,
        title=title,
        start_index=start,
        end_index=start + len(fragment.encode("utf-8")),
    )


def _evidence_text(payload):
    if "location" in payload:
        unit = payload["temperatureUnit"]
        forecast_entries = []
        for item in payload.get("forecast", []):
            high = f"{item['high']} {unit}" if item.get("high") is not None else ""
            low = f"{item['low']} {unit}" if item.get("low") is not None else ""
            forecast_entries.append(
                f"{item['label']}|{item['condition']}|{high}|{low}"
            )
        forecast = "; ".join(forecast_entries)
        lines = [
            f"Location: {payload['location']}",
            f"Observed at: {payload['observedAt']}",
            f"Current temperature: {payload['temperature']} {payload['temperatureUnit']}",
            f"Condition: {payload['condition']}",
        ]
        if payload.get("high") is not None:
            lines.append(f"High: {payload['high']} {payload['temperatureUnit']}")
        if payload.get("low") is not None:
            lines.append(f"Low: {payload['low']} {payload['temperatureUnit']}")
        if forecast:
            lines.append(f"Forecast: {forecast}")
        return "\n".join(lines)
    lines = [
        f"Base: {payload['base']}",
        f"Quote: {payload['quote']}",
        f"Amount: {payload['amount']}",
        f"Rate: {payload['rate']}",
        f"Converted amount: {payload['convertedAmount']}",
        f"As of: {payload['asOf']}",
    ]
    if payload.get("inverseRate") is not None:
        lines.insert(5, f"Inverse rate: {payload['inverseRate']}")
    return "\n".join(lines)


def _interaction_response(text, *, annotations, input_tokens, output_tokens):
    return SimpleNamespace(
        model="gemini-3.8-flash-001",
        output_text=text,
        usage=SimpleNamespace(
            total_input_tokens=input_tokens,
            total_output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
        ),
        steps=[
            SimpleNamespace(
                type="model_output",
                content=[
                    SimpleNamespace(type="text", text=text, annotations=annotations)
                ],
            )
        ],
    )


def fake_response(
    payload,
    *,
    source=True,
    citation_fragments=None,
    source_urls=None,
):
    evidence = _evidence_text(payload)
    fragments = citation_fragments or [evidence]
    urls = source_urls or ["https://example.com/current"] * len(fragments)
    annotations = (
        [
            _citation(evidence, fragment, url=url, title=f"Source {index + 1}")
            for index, (fragment, url) in enumerate(zip(fragments, urls, strict=True))
        ]
        if source
        else []
    )
    evidence_response = _interaction_response(
        evidence, annotations=annotations, input_tokens=9, output_tokens=5
    )
    evidence_response.steps.insert(
        0,
        SimpleNamespace(
            type="google_search_call",
            arguments=SimpleNamespace(queries=["current conditions"]),
        ),
    )
    return evidence_response


def fake_client(*responses):
    flattened = [
        item
        for response in responses
        for item in (response if isinstance(response, tuple) else (response,))
    ]
    if len(flattened) == 1:
        flattened.append(flattened[0])
    create = AsyncMock(side_effect=flattened)
    return (
        SimpleNamespace(
            aio=SimpleNamespace(interactions=SimpleNamespace(create=create))
        ),
        create,
    )


@pytest.mark.asyncio
async def test_weather_omits_optional_values_cited_only_by_another_source():
    payload = {
        "location": "Berlin, Germany",
        "observedAt": "2026-09-22T10:00:00+02:00",
        "temperatureUnit": "C",
        "temperature": "18.5",
        "condition": "Partly cloudy",
        "high": "21",
        "low": "12",
        "forecast": [
            {
                "label": "Tomorrow",
                "condition": "Sunny",
                "high": "22",
                "low": "13",
            }
        ],
    }
    evidence = _evidence_text(payload)
    split_at = evidence.index("\nHigh:")
    response = fake_response(
        payload,
        citation_fragments=[evidence[:split_at], evidence[split_at + 1 :]],
        source_urls=[
            "https://example.com/location",
            "https://weather.example.com/forecast",
        ],
    )
    client, create = fake_client(response)
    runner = GeminiAssistantWidgetRunner(client=client, now=lambda: NOW)

    first = await runner.weather("Berlin", temperature_unit="C")
    second = await runner.weather("  Berlin  ", temperature_unit="C")

    assert first.cache_hit is False
    assert second.cache_hit is True
    assert isinstance(first.payload, WeatherCandidate)
    assert first.payload.temperature == "18.5"
    assert first.payload.high is None
    assert first.payload.low is None
    assert first.payload.forecast == []
    assert first.source.url == "https://example.com/location"
    assert first.model == "gemini-3.8-flash"
    assert first.model_version == "gemini-3.8-flash-001"
    assert first.input_tokens == 9 and first.output_tokens == 5
    assert first.search_calls == 1
    assert second.input_tokens == 0 and second.output_tokens == 0
    assert second.search_calls == 0
    assert create.await_count == 1
    search_call = create.await_args_list[0].kwargs
    assert search_call["model"] == "gemini-3.8-flash"
    assert search_call["input"].startswith("Use up to two focused Google searches")
    assert search_call["tools"] == [{"type": "google_search"}]
    assert "response_format" not in search_call
    assert search_call["generation_config"] == {"thinking_level": "low"}
    assert search_call["store"] is False


@pytest.mark.asyncio
async def test_weather_uses_server_retrieval_time_when_source_omits_observed_at():
    evidence = (
        "Location: Berlin\n"
        "Current temperature: 18 C\n"
        "Condition: Clear"
    )
    evidence_response = _interaction_response(
        evidence,
        annotations=[_citation(evidence, evidence)],
        input_tokens=5,
        output_tokens=3,
    )
    client, create = fake_client(evidence_response)

    result = await GeminiAssistantWidgetRunner(
        client=client, now=lambda: NOW
    ).weather("Berlin", temperature_unit="C")

    assert result.payload.observed_at == "2026-09-22T12:00:00+00:00"
    assert create.await_count == 1


@pytest.mark.asyncio
async def test_weather_rejects_core_values_split_across_sources():
    payload = {
        "location": "Berlin",
        "observedAt": "2026-09-22T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    evidence = _evidence_text(payload)
    condition = "Condition: Clear"
    first = evidence[: evidence.index(condition)].strip()
    response = fake_response(
        payload,
        citation_fragments=[first, condition],
        source_urls=[
            "https://weather.example.com/current",
            "https://weather.example.com/condition",
        ],
    )
    client, create = fake_client(response)

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).weather(
            "Berlin", temperature_unit="C"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"
    assert create.await_count == 2


@pytest.mark.asyncio
async def test_weather_accepts_core_values_split_across_one_source_annotations():
    payload = {
        "location": "Berlin",
        "observedAt": "2026-09-22T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    evidence = _evidence_text(payload)
    condition = "Condition: Clear"
    response = fake_response(
        payload,
        citation_fragments=[
            evidence[: evidence.index(condition)].strip(),
            condition,
        ],
        source_urls=[
            "https://weather.example.com/current",
            "https://weather.example.com/current",
        ],
    )
    client, create = fake_client(response)

    result = await GeminiAssistantWidgetRunner(
        client=client, now=lambda: NOW
    ).weather("Berlin", temperature_unit="C")

    assert result.source.url == "https://weather.example.com/current"
    assert result.payload.condition == "Clear"
    assert create.await_count == 1


@pytest.mark.parametrize(
    "evidence",
    [
        "Location: Berlin\nCurrent temperature: 18\nCondition: Clear",
        "Location: Berlin\nCurrent temperature: 18 F\nCondition: Clear",
        f"Location: Berlin\nCurrent temperature: 18 C\nCondition: {'x' * 121}",
        (
            "Location: Berlin\nCurrent temperature: 18 C\nCondition: Clear\n"
            "High: 20 F"
        ),
        (
            "Location: Berlin\nCurrent temperature: 18 C\nCondition: Clear\n"
            "Forecast: Tomorrow: Sunny, high 20, low 10"
        ),
    ],
)
@pytest.mark.asyncio
async def test_weather_parser_rejects_ambiguous_or_out_of_contract_lines(evidence):
    response = _interaction_response(
        evidence,
        annotations=[_citation(evidence, evidence)],
        input_tokens=5,
        output_tokens=3,
    )
    client, create = fake_client(response)

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).weather(
            "Berlin", temperature_unit="C"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"
    assert create.await_count == 2


@pytest.mark.asyncio
async def test_identical_concurrent_widget_requests_share_one_provider_call():
    response = fake_response(
        {
            "location": "Berlin",
            "observedAt": "2026-09-22T10:00:00Z",
            "temperatureUnit": "C",
            "temperature": "18",
            "condition": "Clear",
            "forecast": [],
        }
    )
    client, create = fake_client(response)
    runner = GeminiAssistantWidgetRunner(client=client, now=lambda: NOW)

    first, second = await asyncio.gather(
        runner.weather("Berlin", temperature_unit="C"),
        runner.weather("Berlin", temperature_unit="C"),
    )

    assert sorted([first.cache_hit, second.cache_hit]) == [False, True]
    assert sorted([first.input_tokens, second.input_tokens]) == [0, 9]
    assert create.await_count == 1


@pytest.mark.asyncio
async def test_cancelling_one_widget_waiter_preserves_shared_provider_call():
    started = asyncio.Event()
    release = asyncio.Event()
    cancelled = asyncio.Event()
    response = fake_response(
        {
            "location": "Berlin",
            "observedAt": "2026-09-22T10:00:00Z",
            "temperatureUnit": "C",
            "temperature": "18",
            "condition": "Clear",
            "forecast": [],
        }
    )

    async def create(**_kwargs):
        started.set()
        try:
            await release.wait()
            return response
        except asyncio.CancelledError:
            cancelled.set()
            raise

    runner = GeminiAssistantWidgetRunner(
        client=SimpleNamespace(
            aio=SimpleNamespace(interactions=SimpleNamespace(create=create))
        ),
        now=lambda: NOW,
    )
    first = asyncio.create_task(runner.weather("Berlin", temperature_unit="C"))
    second = asyncio.create_task(runner.weather("Berlin", temperature_unit="C"))
    await started.wait()
    await asyncio.sleep(0)
    first.cancel()
    with pytest.raises(asyncio.CancelledError):
        await first
    assert not cancelled.is_set()
    release.set()
    result = await second
    assert result.payload.temperature == "18"
    assert not cancelled.is_set()


@pytest.mark.asyncio
async def test_cancelling_last_widget_waiter_cancels_provider_call():
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def create(**_kwargs):
        started.set()
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled.set()
            raise

    runner = GeminiAssistantWidgetRunner(
        client=SimpleNamespace(
            aio=SimpleNamespace(interactions=SimpleNamespace(create=create))
        ),
        now=lambda: NOW,
    )
    waiter = asyncio.create_task(runner.weather("Berlin", temperature_unit="C"))
    await started.wait()
    waiter.cancel()
    with pytest.raises(asyncio.CancelledError):
        await waiter
    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_unparseable_evidence_retries_with_another_grounded_lookup():
    payload = {
        "location": "Berlin",
        "observedAt": "2026-09-22T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    incomplete_text = (
        "Location: Berlin\n"
        "Observed at: 2026-09-22T10:00:00Z\n"
        "Current temperature: Not reported in the retrieved source snippet\n"
        "Condition: Clear"
    )
    incomplete_response = _interaction_response(
        incomplete_text,
        annotations=[_citation(incomplete_text, incomplete_text)],
        input_tokens=4,
        output_tokens=2,
    )
    incomplete_response.steps.insert(
        0,
        SimpleNamespace(
            type="google_search_call",
            arguments=SimpleNamespace(queries=["Berlin weather", "Berlin temperature"]),
        ),
    )
    complete_response = fake_response(payload)
    client, create = fake_client(incomplete_response, complete_response)

    result = await GeminiAssistantWidgetRunner(
        client=client, now=lambda: NOW
    ).weather("Berlin", temperature_unit="C")

    assert result.payload.temperature == "18"
    assert result.input_tokens == 13
    assert result.output_tokens == 7
    assert result.search_calls == 3
    assert create.await_count == 2
    assert create.await_args_list[0].kwargs["tools"] == [
        {"type": "google_search"}
    ]
    assert create.await_args_list[1].kwargs["tools"] == [
        {"type": "google_search"}
    ]
    assert "different authoritative source" in create.await_args_list[1].kwargs["input"]


@pytest.mark.asyncio
async def test_incomplete_evidence_retry_has_its_own_stage_budget(monkeypatch):
    monkeypatch.setattr(
        widget_runner_module,
        "DEFAULT_WIDGET_EVIDENCE_STAGE_SECONDS",
        0.01,
    )
    incomplete_text = (
        "Location: Berlin\n"
        "Observed at: 2026-09-22T10:00:00Z\n"
        "Current temperature: unavailable\n"
        "Condition: Clear"
    )
    incomplete_response = _interaction_response(
        incomplete_text,
        annotations=[_citation(incomplete_text, incomplete_text)],
        input_tokens=4,
        output_tokens=2,
    )
    calls = []

    async def create(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return incomplete_response
        await asyncio.sleep(1)

    client = SimpleNamespace(
        aio=SimpleNamespace(interactions=SimpleNamespace(create=create))
    )
    runner = GeminiAssistantWidgetRunner(
        client=client,
        now=lambda: NOW,
        deadline_seconds=1,
    )
    started_at = asyncio.get_running_loop().time()

    with pytest.raises(AssistantWidgetError) as error:
        await runner.weather("Berlin", temperature_unit="C")

    elapsed = asyncio.get_running_loop().time() - started_at
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_DEADLINE"
    assert elapsed < 0.2
    assert len(calls) == 2
    assert all(call["tools"] == [{"type": "google_search"}] for call in calls)


@pytest.mark.asyncio
async def test_two_unparseable_evidence_results_fail_after_two_searches():
    incomplete_text = (
        "Location: Berlin\n"
        "Observed at: 2026-09-22T10:00:00Z\n"
        "Current temperature: Not reported\n"
        "Condition: Clear"
    )
    incomplete_response = _interaction_response(
        incomplete_text,
        annotations=[_citation(incomplete_text, incomplete_text)],
        input_tokens=4,
        output_tokens=2,
    )
    client, create = fake_client(incomplete_response, incomplete_response)

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).weather(
            "Berlin", temperature_unit="C"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"
    assert create.await_count == 2
    assert all(
        call.kwargs["tools"] == [{"type": "google_search"}]
        for call in create.await_args_list
    )


@pytest.mark.asyncio
async def test_currency_requires_the_requested_pair_and_amount():
    response = fake_response(
        {
            "base": "EUR",
            "quote": "USD",
            "amount": "10.00",
            "convertedAmount": "11.80",
            "rate": "1.18",
            "inverseRate": "0.84745763",
            "asOf": "2026-09-22T08:00:00Z",
        }
    )
    client, _generate = fake_client(response)
    result = await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).currency(
        "EUR", "USD", "10"
    )
    assert isinstance(result.payload, CurrencyCandidate)
    assert result.payload.converted_amount == "11.80"

    mismatch = fake_response(
        {
            "base": "GBP",
            "quote": "USD",
            "amount": "10",
            "convertedAmount": "12",
            "rate": "1.2",
            "asOf": "2026-09-22T08:00:00Z",
        }
    )
    mismatch_client, _generate = fake_client(mismatch)
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=mismatch_client, now=lambda: NOW
        ).currency(
            "EUR", "USD", "10"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_MISMATCH"


@pytest.mark.asyncio
async def test_currency_rejects_as_of_cited_only_by_another_source():
    payload = {
        "base": "EUR",
        "quote": "USD",
        "amount": "10",
        "convertedAmount": "11.80",
        "rate": "1.18",
        "asOf": "2026-09-22T08:00:00Z",
    }
    evidence = _evidence_text(payload)
    as_of = "As of: 2026-09-22T08:00:00Z"
    response = fake_response(
        payload,
        citation_fragments=[evidence[: evidence.index(as_of)].strip(), as_of],
        source_urls=[
            "https://rates.example.com/current",
            "https://rates.example.com/timestamp",
        ],
    )
    client, create = fake_client(response)

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).currency(
            "EUR", "USD", "10"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"
    assert create.await_count == 2


@pytest.mark.asyncio
async def test_currency_parser_rejects_non_decimal_labeled_values():
    evidence = (
        "Base: EUR\n"
        "Quote: USD\n"
        "Amount: 10\n"
        "Rate: 1,18\n"
        "Converted amount: 11,80\n"
        "As of: 2026-09-22T08:00:00Z"
    )
    response = _interaction_response(
        evidence,
        annotations=[_citation(evidence, evidence)],
        input_tokens=5,
        output_tokens=3,
    )
    client, create = fake_client(response)

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).currency(
            "EUR", "USD", "10"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"
    assert create.await_count == 2


@pytest.mark.asyncio
async def test_widget_fails_closed_without_grounding_or_parseable_lines():
    no_source, _generate = fake_client(
        fake_response(
            {
                "location": "Berlin",
                "observedAt": "2026-09-22T10:00:00+02:00",
                "temperatureUnit": "C",
                "temperature": "18",
                "condition": "Clear",
                "forecast": [],
            },
            source=False,
        )
    )
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=no_source, now=lambda: NOW).weather(
            "Berlin", temperature_unit="C"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"

    invalid_response = SimpleNamespace(
        model="gemini-3.8-flash-001",
        output_text="not labeled data",
        usage=None,
        steps=[
            SimpleNamespace(
                type="model_output",
                content=[
                    SimpleNamespace(
                        type="text", text="not labeled data", annotations=[]
                    )
                ],
            )
        ],
    )
    invalid_client, _generate = fake_client(invalid_response, invalid_response)
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=invalid_client, now=lambda: NOW
        ).weather(
            "Berlin", temperature_unit="C"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"


@pytest.mark.asyncio
async def test_widget_rejects_non_public_citation_even_when_it_covers_output():
    payload = {
        "location": "Berlin",
        "observedAt": "2026-09-22T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    client, _create = fake_client(
        fake_response(
            payload,
            source_urls=["https://127.0.0.1/private-weather"],
        )
    )

    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).weather(
            "Berlin", temperature_unit="C"
        )

    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"


def test_widget_candidates_reject_floats_and_naive_timestamps():
    with pytest.raises(ValueError):
        WeatherCandidate.model_validate(
            {
                "location": "Berlin",
                "observedAt": "2026-09-22T10:00:00",
                "temperatureUnit": "C",
                "temperature": 18.5,
                "condition": "Clear",
                "forecast": [],
            }
        )

    with pytest.raises(ValueError):
        CurrencyCandidate.model_validate(
            {
                "base": "EUR",
                "quote": "USD",
                "amount": "10",
                "convertedAmount": "-12",
                "rate": "1.2",
                "asOf": "2026-09-22T10:00:00Z",
            }
        )


@pytest.mark.asyncio
async def test_widget_rejects_unlinked_sources_and_wrong_weather_unit():
    payload = {
        "location": "Berlin",
        "observedAt": "2026-09-22T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    unlinked_client, _generate = fake_client(
        fake_response(payload, citation_fragments=["Berlin"])
    )
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=unlinked_client, now=lambda: NOW
        ).weather("Berlin", temperature_unit="C")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"

    wrong_location = {**payload, "location": "Paris, France"}
    wrong_location_client, _generate = fake_client(fake_response(wrong_location))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=wrong_location_client, now=lambda: NOW
        ).weather("Berlin", temperature_unit="C")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_MISMATCH"

    wrong_unit = {**payload, "temperatureUnit": "F"}
    wrong_unit_client, _generate = fake_client(fake_response(wrong_unit))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=wrong_unit_client, now=lambda: NOW
        ).weather("Berlin", temperature_unit="C")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"


@pytest.mark.asyncio
async def test_widget_rejects_incorrect_currency_arithmetic_and_weak_citations():
    incorrect = {
        "base": "EUR",
        "quote": "USD",
        "amount": "10",
        "convertedAmount": "13",
        "rate": "1.18",
        "inverseRate": "0.84745763",
        "asOf": "2026-09-22T08:00:00Z",
    }
    incorrect_client, _generate = fake_client(fake_response(incorrect))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=incorrect_client, now=lambda: NOW
        ).currency("EUR", "USD", "10")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_MISMATCH"

    weak_grounding_client, _generate = fake_client(
        fake_response(incorrect, citation_fragments=["1.18"])
    )
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=weak_grounding_client, now=lambda: NOW
        ).currency("EUR", "USD", "10")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_UNGROUNDED"


@pytest.mark.asyncio
async def test_same_currency_requires_identity_conversion():
    incorrect = {
        "base": "EUR",
        "quote": "EUR",
        "amount": "10",
        "convertedAmount": "11",
        "rate": "1.1",
        "inverseRate": "0.9090909",
        "asOf": "2026-09-22T08:00:00Z",
    }
    client, _generate = fake_client(fake_response(incorrect))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).currency(
            "EUR", "EUR", "10"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_MISMATCH"

    identity = {
        **incorrect,
        "convertedAmount": "10.00",
        "rate": "1",
        "inverseRate": "1.0",
    }
    identity_client, _generate = fake_client(fake_response(identity))
    result = await GeminiAssistantWidgetRunner(
        client=identity_client, now=lambda: NOW
    ).currency("EUR", "EUR", "10")
    assert result.payload.converted_amount == "10.00"


@pytest.mark.asyncio
async def test_currency_timestamp_must_be_fresh():
    stale = {
        "base": "EUR",
        "quote": "USD",
        "amount": "10",
        "convertedAmount": "11.8",
        "rate": "1.18",
        "asOf": "2026-09-10T08:00:00Z",
    }
    client, _generate = fake_client(fake_response(stale))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(client=client, now=lambda: NOW).currency(
            "EUR", "USD", "10"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_STALE"
