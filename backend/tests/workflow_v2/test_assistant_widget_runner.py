from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from google.genai import types

from backend.services.workflow_v2.assistant.widget_runner import (
    AssistantWidgetError,
    CurrencyCandidate,
    GeminiAssistantWidgetRunner,
    WeatherCandidate,
)

pytestmark = pytest.mark.contract
NOW = datetime(2026, 9, 22, 12, 0, tzinfo=timezone.utc)


def fake_response(payload, *, source=True, linked=True, support_text=None):
    encoded = json.dumps(payload)
    grounding = (
        types.GroundingMetadata(
            grounding_chunks=[
                types.GroundingChunk(
                    web=types.GroundingChunkWeb(
                        title="Official source", uri="https://example.com/current"
                    )
                )
            ],
            grounding_supports=(
                [
                    types.GroundingSupport(
                        grounding_chunk_indices=[0],
                        segment=types.Segment(
                            text=support_text or encoded,
                            start_index=0,
                            end_index=len((support_text or encoded).encode("utf-8")),
                            part_index=0,
                        ),
                    )
                ]
                if linked
                else []
            ),
        )
        if source
        else None
    )
    return types.GenerateContentResponse(
        model_version="gemini-3.8-flash-001",
        usage_metadata=types.GenerateContentResponseUsageMetadata(
            prompt_token_count=9, candidates_token_count=5, total_token_count=14
        ),
        candidates=[
            types.Candidate(
                grounding_metadata=grounding,
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=encoded)],
                ),
            )
        ],
    )


def fake_client(*responses):
    generate = AsyncMock(side_effect=list(responses))
    return (
        SimpleNamespace(
            aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
        ),
        generate,
    )


@pytest.mark.asyncio
async def test_weather_is_structured_grounded_and_cached():
    response = fake_response(
        {
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
    )
    client, generate = fake_client(response)
    runner = GeminiAssistantWidgetRunner(client=client, now=lambda: NOW)

    first = await runner.weather("Berlin", temperature_unit="C")
    second = await runner.weather("  Berlin  ", temperature_unit="C")

    assert first.cache_hit is False
    assert second.cache_hit is True
    assert isinstance(first.payload, WeatherCandidate)
    assert first.payload.temperature == "18.5"
    assert first.source.url == "https://example.com/current"
    assert first.input_tokens == 9 and first.output_tokens == 5
    assert second.input_tokens == 0 and second.output_tokens == 0
    assert generate.await_count == 1
    call = generate.await_args.kwargs
    assert call["model"] == "gemini-3.8-flash"
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].tools[0].google_search is not None
    assert call["config"].thinking_config.thinking_level == types.ThinkingLevel.LOW


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
    client, generate = fake_client(response)
    runner = GeminiAssistantWidgetRunner(client=client, now=lambda: NOW)

    first, second = await asyncio.gather(
        runner.weather("Berlin", temperature_unit="C"),
        runner.weather("Berlin", temperature_unit="C"),
    )

    assert sorted([first.cache_hit, second.cache_hit]) == [False, True]
    assert sorted([first.input_tokens, second.input_tokens]) == [0, 9]
    assert generate.await_count == 1


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
async def test_widget_fails_closed_without_grounding_or_valid_json():
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

    invalid_response = types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                grounding_metadata=types.GroundingMetadata(
                    grounding_chunks=[
                        types.GroundingChunk(
                            web=types.GroundingChunkWeb(
                                title="Source", uri="https://example.com/weather"
                            )
                        )
                    ]
                ),
                content=types.Content(
                    role="model", parts=[types.Part.from_text(text="not json")]
                ),
            )
        ]
    )
    invalid_client, _generate = fake_client(invalid_response)
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=invalid_client, now=lambda: NOW
        ).weather(
            "Berlin", temperature_unit="C"
        )
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT"


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
        fake_response(payload, support_text="Berlin weather source")
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
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_MISMATCH"


@pytest.mark.asyncio
async def test_widget_rejects_stale_weather_and_incorrect_currency_arithmetic():
    stale_weather = {
        "location": "Berlin",
        "observedAt": "2026-09-20T10:00:00Z",
        "temperatureUnit": "C",
        "temperature": "18",
        "condition": "Clear",
        "forecast": [],
    }
    stale_client, _generate = fake_client(fake_response(stale_weather))
    with pytest.raises(AssistantWidgetError) as error:
        await GeminiAssistantWidgetRunner(
            client=stale_client, now=lambda: NOW
        ).weather("Berlin", temperature_unit="C")
    assert error.value.code == "AXWISE_ASSISTANT_WIDGET_STALE"

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
        fake_response(incorrect, support_text="The current rate is 1.18")
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
