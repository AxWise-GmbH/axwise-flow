"""Bounded data-provider lookups, without an LLM or durable research workflow.

Open-Meteo current values are weather-model estimates valid at the provider's
timestamp, not station observations. Its public endpoint is for evaluation;
commercial installations must configure OPEN_METEO_API_KEY. Frankfurter serves
daily reference rates, not tradable quotes or an all-in bank conversion price.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
import unicodedata
from collections import OrderedDict
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, localcontext
from typing import Any, Awaitable, Callable, Literal
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx

from .widget_runner import (
    MONEY_AMOUNT_PATTERN,
    AssistantWidgetError,
    AssistantWidgetResult,
    CurrencyCandidate,
    WeatherCandidate,
    WeatherForecastCandidate,
    WidgetSource,
)

CONDITIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Light rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Light snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with light hail",
    99: "Thunderstorm with heavy hail",
}


def _error(suffix: str, *, retryable: bool = True) -> AssistantWidgetError:
    return AssistantWidgetError(
        f"AXWISE_ASSISTANT_WIDGET_{suffix}", retryable=retryable
    )


def _fold(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(char)
    ).strip()


def _number(value: Any) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal)):
        raise _error("PROVIDER_INVALID")
    result = Decimal(str(value))
    if not result.is_finite():
        raise _error("PROVIDER_INVALID")
    return result


def _text(value: Decimal, places: int = 12) -> str:
    with localcontext() as context:
        context.prec = 60
        result = format(value.quantize(Decimal(1).scaleb(-places)), "f")
    return result.rstrip("0").rstrip(".") if "." in result else result


def _temperature(value: Any, unit: str) -> str:
    result = _number(value)
    low, high = (-100, 70) if unit == "C" else (-148, 158)
    if not low <= result <= high:
        raise _error("PROVIDER_INVALID")
    return _text(result, 2)


def _condition(value: Any) -> str:
    if type(value) is not int or value not in CONDITIONS:
        raise _error("PROVIDER_INVALID")
    return CONDITIONS[value]


def _place(location: str, response: Any) -> dict[str, Any]:
    rows = response.get("results", []) if isinstance(response, dict) else []
    if not isinstance(rows, list):
        raise _error("PROVIDER_INVALID")
    usable = []
    seen = set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("name"), str):
            continue
        latitude, longitude = _number(row.get("latitude")), _number(
            row.get("longitude")
        )
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise _error("PROVIDER_INVALID")
        coordinates = (round(latitude, 4), round(longitude, 4))
        if coordinates not in seen:
            seen.add(coordinates)
            usable.append(row)
    exact = [
        row
        for row in usable
        if _fold(row["name"]) == _fold(location.split(",")[0])
        or location in row.get("postcodes", [])
    ]
    choices = exact or usable
    if not choices:
        raise _error("LOCATION_NOT_FOUND", retryable=False)
    if len(choices) == 1:
        return choices[0]

    def population(row: dict) -> int:
        value = row.get("population")
        return value if type(value) is int and value >= 0 else 0

    choices.sort(key=population, reverse=True)
    # A large well-known city may share its name with a small village. Comparable
    # cities, prefixes, or missing populations need a country/region from the user.
    if (
        exact
        and population(choices[0]) >= 100_000
        and population(choices[0]) >= 10 * max(1, population(choices[1]))
    ):
        return choices[0]
    raise _error("LOCATION_AMBIGUOUS", retryable=False)


class StructuredWidgetRunner:
    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        deadline_seconds: float = 8.0,
        weather_ttl_seconds: float = 300,
        currency_ttl_seconds: float = 900,
        max_cache_entries: int = 256,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] | None = None,
        open_meteo_api_key: str | None = None,
    ) -> None:
        if not 0 < deadline_seconds <= 8 or not 1 <= max_cache_entries <= 256:
            raise ValueError("invalid structured lookup limits")
        if any(
            not 0 <= ttl <= 3600 for ttl in (weather_ttl_seconds, currency_ttl_seconds)
        ):
            raise ValueError("invalid structured lookup cache TTL")
        self.now = now or (lambda: datetime.now(timezone.utc))
        if self.now().tzinfo is None:
            raise ValueError("wall clock must be timezone aware")
        self.clock = clock
        self.deadline_seconds = deadline_seconds
        self.weather_ttl_seconds = weather_ttl_seconds
        self.currency_ttl_seconds = currency_ttl_seconds
        self.max_cache_entries = max_cache_entries
        self._key = open_meteo_api_key or os.getenv("OPEN_METEO_API_KEY")
        self._owns_client = client is None
        self.client = client or httpx.AsyncClient(
            timeout=deadline_seconds, follow_redirects=False
        )
        self._cache: OrderedDict[tuple, tuple[float, AssistantWidgetResult]] = (
            OrderedDict()
        )
        self._geocache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._inflight: dict[tuple, asyncio.Task] = {}
        self._waiters: dict[tuple, int] = {}

    async def _json(self, url: str, params: dict | None = None) -> Any:
        async with self.client.stream(
            "GET", url, params=params, follow_redirects=False
        ) as response:
            if response.status_code in (400, 404, 422):
                raise _error("PROVIDER_NO_DATA", retryable=False)
            response.raise_for_status()
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > 1_048_576:
                    raise _error("PROVIDER_INVALID")
            return json.loads(body, parse_float=Decimal)

    def _fresh(self, result: AssistantWidgetResult) -> bool:
        raw = (
            result.payload.observed_at
            if result.kind == "weather"
            else result.payload.as_of
        )
        valid_at = datetime.fromisoformat(raw)
        now = self.now()
        age = now - valid_at
        if result.kind == "weather":
            return timedelta(minutes=-10) <= age <= timedelta(hours=2)
        return (
            timedelta(days=-1) < age <= timedelta(days=7)
            and valid_at.date() <= now.date()
        )

    async def _cached(
        self,
        key: tuple,
        ttl: float,
        lookup: Callable[[], Awaitable[AssistantWidgetResult]],
    ) -> AssistantWidgetResult:
        cached = self._cache.get(key)
        if cached and cached[0] > self.clock() and self._fresh(cached[1]):
            self._cache.move_to_end(key)
            return replace(cached[1], cache_hit=True)
        self._cache.pop(key, None)
        task = self._inflight.get(key)
        if task is None:
            if len(self._inflight) >= 64:
                raise _error("BUSY")

            async def run() -> AssistantWidgetResult:
                try:
                    result = await asyncio.wait_for(
                        lookup(), timeout=self.deadline_seconds
                    )
                    if not self._fresh(result):
                        raise _error("STALE")
                    if ttl:
                        effective_ttl = ttl
                        if result.kind == "weather":
                            local_now = self.now().astimezone(
                                datetime.fromisoformat(
                                    result.payload.observed_at
                                ).tzinfo
                            )
                            midnight = (local_now + timedelta(days=1)).replace(
                                hour=0, minute=0, second=0, microsecond=0
                            )
                            effective_ttl = min(
                                ttl, (midnight - local_now).total_seconds()
                            )
                        self._cache[key] = (self.clock() + effective_ttl, result)
                        while len(self._cache) > self.max_cache_entries:
                            self._cache.popitem(last=False)
                    return result
                except AssistantWidgetError:
                    raise
                except (asyncio.TimeoutError, httpx.TimeoutException):
                    raise _error("DEADLINE") from None
                except (
                    httpx.HTTPError,
                    ValueError,
                    KeyError,
                    TypeError,
                    IndexError,
                    OverflowError,
                    InvalidOperation,
                ):
                    raise _error("PROVIDER_INVALID") from None

            task = asyncio.create_task(run())
            self._inflight[key] = task
        self._waiters[key] = self._waiters.get(key, 0) + 1
        try:
            return await asyncio.shield(task)
        finally:
            self._waiters[key] -= 1
            if self._waiters[key] == 0:
                self._waiters.pop(key, None)
                self._inflight.pop(key, None)
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)

    async def weather(
        self, location: str, *, temperature_unit: Literal["C", "F"] = "C"
    ) -> AssistantWidgetResult:
        normalized = re.sub(r"\s+", " ", location).strip()
        if (
            not normalized
            or len(normalized) > 500
            or temperature_unit not in ("C", "F")
        ):
            raise ValueError("invalid weather input")

        async def lookup() -> AssistantWidgetResult:
            paid = "customer-" if self._key else ""
            auth = {"apikey": self._key} if self._key else {}
            place = await self.geocode(normalized)
            parameters = {
                "latitude": str(place["latitude"]),
                "longitude": str(place["longitude"]),
                "current": "temperature_2m,weather_code",
                "daily": "temperature_2m_max,temperature_2m_min,weather_code",
                "timezone": "auto",
                "timeformat": "unixtime",
                "forecast_days": 7,
                "temperature_unit": (
                    "celsius" if temperature_unit == "C" else "fahrenheit"
                ),
            }
            data = await self._json(
                f"https://{paid}api.open-meteo.com/v1/forecast", {**parameters, **auth}
            )
            current, daily = data["current"], data.get("daily", {})
            if data["current_units"]["temperature_2m"] != f"°{temperature_unit}":
                raise _error("PROVIDER_INVALID")
            zone = ZoneInfo(data["timezone"])
            valid_at = datetime.fromtimestamp(
                float(_number(current["time"])), tz=timezone.utc
            ).astimezone(zone)
            today = self.now().astimezone(zone).date()
            forecasts = []
            for index, timestamp in enumerate(daily.get("time", [])[:7]):
                day = (
                    datetime.fromtimestamp(float(_number(timestamp)), tz=timezone.utc)
                    .astimezone(zone)
                    .date()
                )
                if not 0 <= (day - today).days <= 6:
                    continue
                if (
                    data["daily_units"]["temperature_2m_max"] != f"°{temperature_unit}"
                    or data["daily_units"]["temperature_2m_min"]
                    != f"°{temperature_unit}"
                ):
                    raise _error("PROVIDER_INVALID")
                high = _temperature(
                    daily["temperature_2m_max"][index], temperature_unit
                )
                low = _temperature(daily["temperature_2m_min"][index], temperature_unit)
                if Decimal(high) < Decimal(low):
                    raise _error("PROVIDER_INVALID")
                forecasts.append(
                    WeatherForecastCandidate(
                        label=day.isoformat(),
                        condition=_condition(daily["weather_code"][index]),
                        high=high,
                        low=low,
                    )
                )
            today_forecast = next(
                (item for item in forecasts if item.label == today.isoformat()), None
            )
            payload = WeatherCandidate(
                location=place["name"],
                observedAt=valid_at.isoformat(),
                temperatureUnit=temperature_unit,
                temperature=_temperature(current["temperature_2m"], temperature_unit),
                condition=_condition(current["weather_code"]),
                high=today_forecast.high if today_forecast else None,
                low=today_forecast.low if today_forecast else None,
                forecast=forecasts,
            )
            return AssistantWidgetResult(
                kind="weather",
                payload=payload,
                source=WidgetSource(
                    title="Open-Meteo · weather model",
                    url=f"https://api.open-meteo.com/v1/forecast?{urlencode(parameters)}",
                ),
                model="open-meteo",
                model_version="forecast-v1",
                input_tokens=0,
                output_tokens=0,
                search_calls=0,
            )

        return await self._cached(
            ("weather", normalized.casefold(), temperature_unit),
            self.weather_ttl_seconds,
            lookup,
        )

    async def geocode(self, location: str) -> dict[str, Any]:
        """Resolve an unambiguous city for weather or deterministic radius checks."""
        normalized = re.sub(r"\s+", " ", location).strip()
        if not normalized or len(normalized) > 500:
            raise ValueError("invalid location")
        key = normalized.casefold()
        saved = self._geocache.get(key)
        if saved and saved[0] > self.clock():
            self._geocache.move_to_end(key)
            return dict(saved[1])
        paid = "customer-" if self._key else ""
        auth = {"apikey": self._key} if self._key else {}
        try:
            data = await asyncio.wait_for(
                self._json(
                    f"https://{paid}geocoding-api.open-meteo.com/v1/search",
                    {"name": normalized, "count": 10, "language": "en", **auth},
                ),
                self.deadline_seconds,
            )
            place = _place(normalized, data)
            zone = str(place["timezone"])
            ZoneInfo(zone)
            resolved = {
                "latitude": float(_number(place["latitude"])),
                "longitude": float(_number(place["longitude"])),
                "name": ", ".join(
                    dict.fromkeys(
                        str(place[field])
                        for field in ("name", "admin1", "country")
                        if place.get(field)
                    )
                ),
                "timezone": zone,
            }
        except AssistantWidgetError:
            raise
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise _error("DEADLINE") from None
        except (httpx.HTTPError, ValueError, KeyError, TypeError, InvalidOperation):
            raise _error("PROVIDER_INVALID") from None
        self._geocache[key] = (self.clock() + 3600, resolved)
        self._geocache.move_to_end(key)
        while len(self._geocache) > self.max_cache_entries:
            self._geocache.popitem(last=False)
        return dict(resolved)

    async def currency(
        self, base: str, quote: str, amount: str
    ) -> AssistantWidgetResult:
        if (
            not re.fullmatch(r"[A-Z]{3}", base)
            or not re.fullmatch(r"[A-Z]{3}", quote)
            or not re.fullmatch(MONEY_AMOUNT_PATTERN, amount)
        ):
            raise ValueError("invalid currency input")
        requested = Decimal(amount)

        async def lookup() -> AssistantWidgetResult:
            url = f"https://api.frankfurter.dev/v2/rate/{base.lower()}/{quote.lower()}"
            data = await self._json(url)
            if (
                data.get("base", "").upper() != base
                or data.get("quote", "").upper() != quote
            ):
                raise _error("PROVIDER_INVALID")
            rate = _number(data["rate"])
            if (
                rate < Decimal("1e-12")
                or rate > Decimal("1e12")
                or (base == quote and rate != 1)
            ):
                raise _error("PROVIDER_INVALID")
            day = datetime.strptime(data["date"], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            )
            with localcontext() as context:
                context.prec = 60
                payload = CurrencyCandidate(
                    base=base,
                    quote=quote,
                    amount=amount,
                    convertedAmount=_text(requested * rate),
                    rate=_text(rate),
                    inverseRate=_text(1 / rate),
                    asOf=day.isoformat(),
                )
            return AssistantWidgetResult(
                kind="currency",
                payload=payload,
                source=WidgetSource(
                    title="Frankfurter · daily reference rate", url=url
                ),
                model="frankfurter",
                model_version="rates-v2",
                input_tokens=0,
                output_tokens=0,
                search_calls=0,
            )

        return await self._cached(
            ("currency", base, quote, amount), self.currency_ttl_seconds, lookup
        )

    async def close(self) -> None:
        tasks = list(self._inflight.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._cache.clear()
        self._geocache.clear()
        if self._owns_client:
            await self.client.aclose()
