from __future__ import annotations

import asyncio
import copy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest

from backend.services.workflow_v2.assistant.structured_widget_runner import (
    StructuredWidgetRunner,
)
from backend.services.workflow_v2.assistant.widget_runner import AssistantWidgetError

pytestmark = pytest.mark.contract
NOW = datetime(2026, 9, 23, 10, 30, tzinfo=timezone.utc)
PLACE = {
    "id": 598316,
    "name": "Kaunas",
    "admin1": "Kaunas",
    "country": "Lithuania",
    "latitude": 54.9,
    "longitude": 23.9,
    "population": 300000,
    "timezone": "Europe/Vilnius",
}
WEATHER = {
    "timezone": "Europe/Vilnius",
    "utc_offset_seconds": 10800,
    "current_units": {"temperature_2m": "°C"},
    "current": {
        "time": int((NOW - timedelta(minutes=15)).timestamp()),
        "temperature_2m": 12.5,
        "weather_code": 61,
    },
    "daily_units": {"temperature_2m_max": "°C", "temperature_2m_min": "°C"},
    "daily": {
        "time": [int(datetime(2026, 9, 22, 21, tzinfo=timezone.utc).timestamp())],
        "temperature_2m_max": [18.5],
        "temperature_2m_min": [10.2],
        "weather_code": [63],
    },
}
RATE = {"date": "2026-09-23", "base": "EUR", "quote": "USD", "rate": 1.1473}


def setup(*, place=None, weather=None, rate=None, handler=None, **kwargs):
    calls = []

    def serve(request):
        calls.append(request)
        if handler:
            return handler(request)
        if "geocoding" in request.url.host:
            body = place if place is not None else {"results": [PLACE]}
        elif "open-meteo" in request.url.host:
            body = WEATHER if weather is None else weather
        else:
            body = RATE if rate is None else rate
        return httpx.Response(200, json=body)

    client = httpx.AsyncClient(transport=httpx.MockTransport(serve))
    return (
        StructuredWidgetRunner(
            client=client, now=kwargs.pop("now", lambda: NOW), **kwargs
        ),
        calls,
    )


@pytest.mark.asyncio
async def test_weather_uses_valid_time_units_and_local_daily_date_without_llm():
    runner, calls = setup()
    result = await runner.weather("  Kaunas  ")
    assert result.payload.location == "Kaunas, Lithuania"
    assert result.payload.observed_at == "2026-09-23T13:15:00+03:00"
    assert result.payload.observed_at != NOW.isoformat()
    assert result.payload.temperature == "12.5"
    assert result.payload.condition == "Light rain"
    assert result.payload.high == "18.5" and result.payload.low == "10.2"
    assert result.payload.forecast[0].label == "2026-09-23"
    assert result.input_tokens == result.output_tokens == result.search_calls == 0
    assert result.model == "open-meteo"
    assert "weather model" in result.source.title
    assert calls[0].url.params["name"] == "Kaunas"
    assert calls[1].url.params["timeformat"] == "unixtime"
    assert calls[1].url.params["timezone"] == "auto"
    assert (await runner.weather("kaunas")).cache_hit is True
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_paid_provider_key_is_not_leaked_in_source_links():
    runner, calls = setup(open_meteo_api_key="test-only-credential")
    result = await runner.weather("Kaunas")
    assert all(request.url.host.startswith("customer-") for request in calls)
    assert all(
        request.url.params["apikey"] == "test-only-credential" for request in calls
    )
    assert "apikey" not in result.source.url and "test-only" not in result.source.url


@pytest.mark.asyncio
async def test_fahrenheit_is_requested_and_cached_separately():
    value = copy.deepcopy(WEATHER)
    value["current_units"]["temperature_2m"] = "°F"
    value["daily_units"] = {"temperature_2m_max": "°F", "temperature_2m_min": "°F"}
    runner, calls = setup(weather=value)
    result = await runner.weather("Kaunas", temperature_unit="F")
    assert result.payload.temperature_unit == "F"
    assert calls[1].url.params["temperature_unit"] == "fahrenheit"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {
            "current": {
                **WEATHER["current"],
                "time": int((NOW - timedelta(hours=3)).timestamp()),
            }
        },
        {
            "current": {
                **WEATHER["current"],
                "time": int((NOW + timedelta(hours=1)).timestamp()),
            }
        },
        {"current": {**WEATHER["current"], "temperature_2m": None}},
        {"current": {**WEATHER["current"], "weather_code": 999}},
        {"current_units": {"temperature_2m": "°F"}},
        {"daily": {**WEATHER["daily"], "temperature_2m_max": []}},
        {"timezone": "not/a/timezone"},
    ],
)
async def test_bad_weather_fails_closed_and_is_not_cached(change):
    runner, calls = setup(weather={**WEATHER, **change})
    for _ in range(2):
        with pytest.raises(AssistantWidgetError):
            await runner.weather("Kaunas")
    assert len(calls) == 3


@pytest.mark.asyncio
async def test_comparable_cities_need_a_qualifier_not_a_guess():
    runner, calls = setup(
        place={"results": [PLACE, {**PLACE, "latitude": 12.3, "population": 250000}]}
    )
    with pytest.raises(AssistantWidgetError, match="LOCATION_AMBIGUOUS") as error:
        await runner.weather("Kaunas")
    assert error.value.retryable is False and len(calls) == 1


@pytest.mark.asyncio
async def test_a_large_exact_city_dominates_its_small_namesake_village():
    runner, _ = setup(
        place={"results": [PLACE, {**PLACE, "latitude": 12.3, "population": 50}]}
    )
    assert (await runner.weather("Kaunas")).payload.location == "Kaunas, Lithuania"


@pytest.mark.asyncio
async def test_no_location_is_not_filled_by_a_model():
    runner, calls = setup(place={"results": []})
    with pytest.raises(AssistantWidgetError, match="LOCATION_NOT_FOUND"):
        await runner.weather("Missing location")
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_currency_uses_decimal_math_and_the_rate_date():
    runner, calls = setup(rate={**RATE, "date": "2026-09-21", "rate": 0.1})
    result = await runner.currency("EUR", "USD", "0.2")
    assert result.payload.converted_amount == "0.02"
    assert result.payload.rate == "0.1"
    assert result.payload.inverse_rate == "10"
    assert result.payload.as_of == "2026-09-21T00:00:00+00:00"
    assert result.model == "frankfurter" and result.search_calls == 0
    assert "daily reference" in result.source.title
    assert (await runner.currency("EUR", "USD", "0.2")).cache_hit is True
    assert len(calls) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "change",
    [
        {"base": "GBP"},
        {"quote": "JPY"},
        {"rate": -1},
        {"rate": 0},
        {"rate": None},
        {"date": "2026-09-12"},
        {"date": "2026-09-24"},
        {"date": "not-a-date"},
    ],
)
async def test_invalid_or_stale_rates_are_not_displayed(change):
    runner, _ = setup(rate={**RATE, **change})
    with pytest.raises(AssistantWidgetError):
        await runner.currency("EUR", "USD", "10")


@pytest.mark.asyncio
async def test_cache_expires_and_bounds_distinct_entries():
    ticks = [0.0]
    runner, calls = setup(
        clock=lambda: ticks[0], currency_ttl_seconds=10, max_cache_entries=1
    )
    await runner.currency("EUR", "USD", "10")
    ticks[0] = 9
    assert (await runner.currency("EUR", "USD", "10")).cache_hit
    ticks[0] = 11
    assert not (await runner.currency("EUR", "USD", "10")).cache_hit
    await runner.currency("EUR", "USD", "20")
    assert not (await runner.currency("EUR", "USD", "10")).cache_hit
    assert len(calls) == 4 and len(runner._cache) == 1


@pytest.mark.asyncio
async def test_concurrent_queries_share_one_lookup():
    runner, calls = setup()
    results = await asyncio.gather(*(runner.weather("Kaunas") for _ in range(10)))
    assert len(calls) == 2 and len(results) == 10


@pytest.mark.asyncio
async def test_deadline_is_bounded_and_failures_are_not_cached():
    calls = []

    async def slow(request):
        calls.append(request)
        await asyncio.sleep(1)
        return httpx.Response(200, json=RATE)

    client = httpx.AsyncClient(transport=httpx.MockTransport(slow))
    runner = StructuredWidgetRunner(
        client=client, now=lambda: NOW, deadline_seconds=0.01
    )
    for _ in range(2):
        with pytest.raises(AssistantWidgetError, match="DEADLINE"):
            await runner.currency("EUR", "USD", "10")
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_redirect_is_not_followed_and_unsupported_currencies_fail_cleanly():
    runner, calls = setup(
        handler=lambda _: httpx.Response(
            302, headers={"Location": "http://localhost/private"}
        )
    )
    with pytest.raises(AssistantWidgetError):
        await runner.currency("EUR", "USD", "10")
    assert len(calls) == 1
    runner, _ = setup(
        handler=lambda _: httpx.Response(404, json={"message": "Unknown currency"})
    )
    with pytest.raises(AssistantWidgetError, match="PROVIDER_NO_DATA") as error:
        await runner.currency("AAA", "BBB", "10")
    assert error.value.retryable is False


@pytest.mark.asyncio
async def test_invalid_user_inputs_do_not_make_network_calls():
    runner, calls = setup()
    for base, quote, amount in [
        ("eur", "USD", "10"),
        ("EUR", "USD", "-10"),
        ("EUR", "USD", "1e9"),
    ]:
        with pytest.raises(ValueError):
            await runner.currency(base, quote, amount)
    with pytest.raises(ValueError):
        await runner.weather("")
    assert calls == []


@pytest.mark.asyncio
async def test_cancellation_of_one_waiter_does_not_cancel_the_other():
    ready = asyncio.Event()

    async def delayed(_):
        await ready.wait()
        return httpx.Response(200, json=RATE)

    client = httpx.AsyncClient(transport=httpx.MockTransport(delayed))
    runner = StructuredWidgetRunner(client=client, now=lambda: NOW)
    first = asyncio.create_task(runner.currency("EUR", "USD", "10"))
    second = asyncio.create_task(runner.currency("EUR", "USD", "10"))
    await asyncio.sleep(0)
    first.cancel()
    await asyncio.gather(first, return_exceptions=True)
    ready.set()
    assert (await second).payload.rate == "1.1473"
    await runner.close()


@pytest.mark.asyncio
async def test_public_geocode_is_validated_cached_and_returns_independent_objects():
    runner, calls = setup()
    first = await runner.geocode("Kaunas")
    assert first == {
        "name": "Kaunas, Lithuania",
        "latitude": 54.9,
        "longitude": 23.9,
        "timezone": "Europe/Vilnius",
    }
    first["latitude"] = 0
    assert (await runner.geocode("Kaunas"))["latitude"] == 54.9
    await runner.weather("Kaunas")
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "places,wording",
    [
        ([], "couldn’t find"),
        ([PLACE, {**PLACE, "latitude": 12.3, "population": 250000}], "Several places"),
    ],
)
async def test_stateless_projection_preserves_location_clarification(places, wording):
    from backend.api.routes.desktop_information import (
        InformationRequest,
        InformationService,
    )

    runner, _ = setup(place={"results": places})
    service = InformationService(
        quick=SimpleNamespace(close=AsyncMock()), widgets=runner
    )
    result = await service.lookup(
        InformationRequest(
            question="Weather in Kaunas",
            capability={"kind": "weather", "location": "Kaunas", "tempUnit": "C"},
        )
    )
    assert result["outcome"] == "needs_clarification"
    assert wording in result["response"]["markdown"]
    assert result["response"].get("presentations", []) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "capability",
    [
        {"kind": "weather", "location": "Kaunas", "tempUnit": "C"},
        {"kind": "currency", "base": "EUR", "quote": "USD", "amount": "10"},
    ],
)
async def test_structured_provider_projects_through_stateless_contract_without_gemini(
    capability, monkeypatch
):
    from backend.api.routes.desktop_information import (
        InformationRequest,
        InformationService,
    )

    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    def unexpected_gemini_client(*_args, **_kwargs):
        pytest.fail("Structured data must not initialize a Gemini client")

    monkeypatch.setattr(
        "backend.services.workflow_v2.assistant.quick_info_runner.genai.Client",
        unexpected_gemini_client,
    )
    runner, _ = setup()
    service = InformationService(widgets=runner)
    try:
        result = await service.lookup(
            InformationRequest(question="Check live data", capability=capability)
        )
        assert result["outcome"] == "complete"
        assert len(result["response"]["presentations"]) == 1
        assert result["response"]["presentations"][0]["kind"] == capability["kind"]
        assert service.quick is None
    finally:
        await service.close()
        await runner.client.aclose()


@pytest.mark.asyncio
async def test_weather_cache_expires_at_local_midnight_without_rejecting_a_recent_valid_time():
    wall = [datetime(2026, 9, 23, 20, 59, 50, tzinfo=timezone.utc)]
    clock = [0.0]
    weather = copy.deepcopy(WEATHER)
    weather["current"]["time"] = int(
        datetime(2026, 9, 23, 20, 45, tzinfo=timezone.utc).timestamp()
    )
    runner, calls = setup(weather=weather, now=lambda: wall[0], clock=lambda: clock[0])
    await runner.weather("Kaunas")
    wall[0] += timedelta(seconds=9)
    clock[0] = 9
    assert (await runner.weather("Kaunas")).cache_hit
    wall[0] += timedelta(seconds=2)
    clock[0] = 11
    result = await runner.weather("Kaunas")
    assert result.cache_hit is False
    assert result.payload.observed_at == "2026-09-23T23:45:00+03:00"
    assert result.payload.forecast == [] and result.payload.high is None
    assert len(calls) == 3
