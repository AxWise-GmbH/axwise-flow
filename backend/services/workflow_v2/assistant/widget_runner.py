"""Fast grounded weather and currency cards for explicit Assistant V2 requests."""

from __future__ import annotations

import asyncio
import json
import os
import re
import time
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Literal
from urllib.parse import urlsplit

from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.domain.workflow_v2.contracts import is_canonical_public_https_url
from backend.services.llm.gemini_runtime import RESEARCH_MODEL


TEMPERATURE_PATTERN = r"^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$"
UNSIGNED_DECIMAL_PATTERN = r"^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?$"
MONEY_AMOUNT_PATTERN = r"^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$"
DEFAULT_WIDGET_DEADLINE_SECONDS = 25.0
DEFAULT_WEATHER_TTL_SECONDS = 300.0
DEFAULT_CURRENCY_TTL_SECONDS = 900.0
MAX_WIDGET_CACHE_ENTRIES = 256
MAX_WEATHER_AGE = timedelta(hours=24)
MAX_CURRENCY_AGE = timedelta(days=7)
MAX_FUTURE_SKEW = timedelta(minutes=10)


class AssistantWidgetError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class _Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @field_validator("observed_at", "as_of", check_fields=False)
    @classmethod
    def aware_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("timestamp must use ISO 8601") from None
        if parsed.tzinfo is None:
            raise ValueError("timestamp must include an offset")
        return value


class WeatherForecastCandidate(_Candidate):
    label: str = Field(min_length=1, max_length=80)
    condition: str = Field(min_length=1, max_length=120)
    high: str | None = Field(default=None, pattern=TEMPERATURE_PATTERN)
    low: str | None = Field(default=None, pattern=TEMPERATURE_PATTERN)


class WeatherCandidate(_Candidate):
    location: str = Field(min_length=1, max_length=500)
    observed_at: str = Field(alias="observedAt", min_length=10, max_length=50)
    temperature_unit: Literal["C", "F"] = Field(alias="temperatureUnit")
    temperature: str = Field(pattern=TEMPERATURE_PATTERN)
    condition: str = Field(min_length=1, max_length=120)
    high: str | None = Field(default=None, pattern=TEMPERATURE_PATTERN)
    low: str | None = Field(default=None, pattern=TEMPERATURE_PATTERN)
    forecast: list[WeatherForecastCandidate] = Field(max_length=7)


class CurrencyCandidate(_Candidate):
    base: str = Field(pattern=r"^[A-Z]{3}$")
    quote: str = Field(pattern=r"^[A-Z]{3}$")
    amount: str = Field(pattern=MONEY_AMOUNT_PATTERN)
    converted_amount: str = Field(
        alias="convertedAmount", pattern=UNSIGNED_DECIMAL_PATTERN
    )
    rate: str = Field(pattern=UNSIGNED_DECIMAL_PATTERN)
    inverse_rate: str | None = Field(
        default=None, alias="inverseRate", pattern=UNSIGNED_DECIMAL_PATTERN
    )
    as_of: str = Field(alias="asOf", min_length=10, max_length=50)


@dataclass(frozen=True)
class WidgetSource:
    title: str
    url: str


@dataclass(frozen=True)
class AssistantWidgetResult:
    kind: Literal["weather", "currency"]
    payload: WeatherCandidate | CurrencyCandidate
    source: WidgetSource
    model: str
    model_version: str | None
    input_tokens: int | None
    output_tokens: int | None
    cache_hit: bool = False


def _usage_value(response: Any, name: str) -> int | None:
    usage = getattr(response, "usage_metadata", None)
    value = getattr(usage, name, None)
    return value if type(value) is int and value >= 0 else None


def _response_text(response: Any) -> str | None:
    value = getattr(response, "text", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            text = getattr(part, "text", None)
            if isinstance(text, str) and text.strip():
                return text.strip()
    return None


def _grounded_source(
    response: Any, *, required_fragments: tuple[str, ...]
) -> WidgetSource | None:
    normalized_fragments = tuple(fragment.casefold() for fragment in required_fragments)
    for candidate in getattr(response, "candidates", None) or []:
        metadata = getattr(candidate, "grounding_metadata", None)
        chunks = list(getattr(metadata, "grounding_chunks", None) or [])
        supported_text: dict[int, list[str]] = {}
        for support in getattr(metadata, "grounding_supports", None) or []:
            segment = getattr(support, "segment", None)
            segment_text = getattr(segment, "text", None)
            if not isinstance(segment_text, str) or not segment_text.strip():
                continue
            for index in getattr(support, "grounding_chunk_indices", None) or []:
                if type(index) is int and 0 <= index < len(chunks):
                    supported_text.setdefault(index, []).append(segment_text)
        for index, chunk in enumerate(chunks):
            linked_text = " ".join(supported_text.get(index, ())).casefold()
            if not linked_text or not all(
                fragment in linked_text for fragment in normalized_fragments
            ):
                continue
            web = getattr(chunk, "web", None)
            uri = getattr(web, "uri", None)
            if not isinstance(uri, str) or not is_canonical_public_https_url(uri):
                continue
            raw_title = getattr(web, "title", None)
            title = raw_title.strip()[:500] if isinstance(raw_title, str) else ""
            if not title:
                title = (urlsplit(uri).hostname or "Source")[:500]
            return WidgetSource(title=title, url=uri)
    return None


class GeminiAssistantWidgetRunner:
    """One low-thinking grounded lookup with short-lived process-local caching."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: Any | None = None,
        deadline_seconds: float = DEFAULT_WIDGET_DEADLINE_SECONDS,
        weather_ttl_seconds: float = DEFAULT_WEATHER_TTL_SECONDS,
        currency_ttl_seconds: float = DEFAULT_CURRENCY_TTL_SECONDS,
        clock=time.monotonic,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        if deadline_seconds <= 0 or deadline_seconds > 60:
            raise ValueError("assistant widget deadline must be within one minute")
        for ttl in (weather_ttl_seconds, currency_ttl_seconds):
            if ttl < 0 or ttl > 3600:
                raise ValueError("assistant widget cache TTL must be within one hour")
        self.deadline_seconds = deadline_seconds
        self.weather_ttl_seconds = weather_ttl_seconds
        self.currency_ttl_seconds = currency_ttl_seconds
        self.clock = clock
        self.now = now or (lambda: datetime.now(timezone.utc))
        initial_now = self.now()
        if not isinstance(initial_now, datetime) or initial_now.tzinfo is None:
            raise ValueError("assistant widget wall clock must be timezone-aware")
        self._cache: dict[tuple[str, ...], tuple[float, AssistantWidgetResult]] = {}
        self._inflight: dict[
            tuple[str, ...], asyncio.Task[AssistantWidgetResult]
        ] = {}
        self._lock = asyncio.Lock()
        self._owns_client = client is None
        credential = api_key or os.getenv("GEMINI_API_KEY")
        if client is None and not credential:
            raise RuntimeError("GEMINI_API_KEY is required for live data cards")
        self.client = client or genai.Client(api_key=credential)

    async def weather(
        self, location: str, *, temperature_unit: Literal["C", "F"]
    ) -> AssistantWidgetResult:
        normalized = re.sub(r"\s+", " ", location).strip()
        if not normalized or len(normalized) > 500:
            raise ValueError("weather location is outside the accepted boundary")
        if temperature_unit not in {"C", "F"}:
            raise ValueError("unsupported temperature unit")
        key = ("weather", normalized.casefold(), temperature_unit)
        prompt = (
            "Find the current weather and a concise forecast using current web data. "
            "Prefer an authoritative meteorological source. Return only the requested JSON. "
            f"Location: {normalized}. Temperature unit: {temperature_unit}. "
            "Keep the requested location at the start of the location field. Use an offset-aware "
            "observedAt timestamp. Decimal values must be plain strings."
        )
        return await self._cached_generate(
            key,
            self.weather_ttl_seconds,
            kind="weather",
            prompt=prompt,
            candidate_type=WeatherCandidate,
            result_validator=lambda candidate: self._validate_weather_result(
                candidate, normalized, temperature_unit
            ),
        )

    async def currency(
        self, base: str, quote: str, amount: str
    ) -> AssistantWidgetResult:
        if not re.fullmatch(r"[A-Z]{3}", base) or not re.fullmatch(
            r"[A-Z]{3}", quote
        ):
            raise ValueError("currency codes must be three uppercase letters")
        if not re.fullmatch(MONEY_AMOUNT_PATTERN, amount):
            raise ValueError("currency amount must be a bounded decimal string")
        try:
            requested_amount = Decimal(amount)
        except InvalidOperation:
            raise ValueError("currency amount is invalid") from None
        key = ("currency", base, quote, str(requested_amount))
        prompt = (
            "Find the latest current exchange rate using a primary or authoritative source. "
            "Return only the requested JSON and use an offset-aware asOf timestamp. "
            "All numerical values must be plain decimal strings without grouping separators. "
            f"Convert {amount} {base} to {quote}."
        )
        result = await self._cached_generate(
            key,
            self.currency_ttl_seconds,
            kind="currency",
            prompt=prompt,
            candidate_type=CurrencyCandidate,
            result_validator=lambda candidate: self._validate_currency_result(
                candidate, base, quote, requested_amount
            ),
        )
        return result

    @staticmethod
    def _parse_timestamp(value: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
            ) from None
        if parsed.tzinfo is None:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
            )
        return parsed.astimezone(timezone.utc)

    def _validate_freshness(self, value: str, *, maximum_age: timedelta) -> None:
        observed = self._parse_timestamp(value)
        now = self.now()
        if not isinstance(now, datetime) or now.tzinfo is None:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
            )
        now = now.astimezone(timezone.utc)
        if observed < now - maximum_age or observed > now + MAX_FUTURE_SKEW:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_STALE", retryable=True
            )

    def _validate_weather_result(
        self,
        result: AssistantWidgetResult,
        requested_location: str,
        temperature_unit: Literal["C", "F"],
    ) -> None:
        payload = result.payload
        returned_location = (
            re.sub(r"\s+", " ", payload.location).strip().casefold()
            if isinstance(payload, WeatherCandidate)
            else ""
        )
        expected_location = requested_location.casefold()
        if (
            not isinstance(payload, WeatherCandidate)
            or payload.temperature_unit != temperature_unit
            or (
                returned_location != expected_location
                and not returned_location.startswith(f"{expected_location},")
            )
        ):
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
            )
        self._validate_freshness(payload.observed_at, maximum_age=MAX_WEATHER_AGE)

    def _validate_currency_result(
        self,
        result: AssistantWidgetResult,
        base: str,
        quote: str,
        requested_amount: Decimal,
    ) -> None:
        payload = result.payload
        if not isinstance(payload, CurrencyCandidate) or (
            payload.base != base
            or payload.quote != quote
            or Decimal(payload.amount) != requested_amount
        ):
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
            )
        rate = Decimal(payload.rate)
        converted = Decimal(payload.converted_amount)
        inverse = (
            Decimal(payload.inverse_rate)
            if payload.inverse_rate is not None
            else None
        )
        if rate <= 0:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
            )
        if base == quote:
            if rate != 1 or converted != requested_amount or (
                inverse is not None and inverse != 1
            ):
                raise AssistantWidgetError(
                    "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
                )
        else:
            expected = requested_amount * rate
            converted_tolerance = max(
                Decimal("0.01"), abs(expected) * Decimal("0.000001")
            )
            if requested_amount == 0:
                converted_tolerance = Decimal(0)
            if abs(converted - expected) > converted_tolerance:
                raise AssistantWidgetError(
                    "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
                )
            if inverse is not None:
                expected_inverse = Decimal(1) / rate
                inverse_tolerance = max(
                    Decimal("0.000000001"),
                    abs(expected_inverse) * Decimal("0.000001"),
                )
                if abs(inverse - expected_inverse) > inverse_tolerance:
                    raise AssistantWidgetError(
                        "AXWISE_ASSISTANT_WIDGET_MISMATCH", retryable=True
                    )
        self._validate_freshness(payload.as_of, maximum_age=MAX_CURRENCY_AGE)

    async def _cached_generate(
        self,
        key: tuple[str, ...],
        ttl_seconds: float,
        *,
        kind: Literal["weather", "currency"],
        prompt: str,
        candidate_type: type[WeatherCandidate] | type[CurrencyCandidate],
        result_validator: Callable[[AssistantWidgetResult], None] | None = None,
    ) -> AssistantWidgetResult:
        now = self.clock()
        async with self._lock:
            for expired_key in [
                candidate
                for candidate, (expires_at, _result) in self._cache.items()
                if expires_at <= now
            ]:
                self._cache.pop(expired_key, None)
            cached = self._cache.get(key)
            if cached and cached[0] > now:
                return replace(
                    cached[1], input_tokens=0, output_tokens=0, cache_hit=True
                )
            task = self._inflight.get(key)
            shared = task is not None
            if task is None:

                async def generate_and_validate() -> AssistantWidgetResult:
                    result = await self._generate(
                        kind=kind, prompt=prompt, candidate_type=candidate_type
                    )
                    if result_validator is not None:
                        result_validator(result)
                    return result

                task = asyncio.create_task(generate_and_validate())
                self._inflight[key] = task
                task.add_done_callback(
                    lambda completed, cache_key=key, ttl=ttl_seconds: asyncio.create_task(
                        self._settle_generation(cache_key, completed, ttl)
                    )
                )
        # A cancelled desktop request must not cancel the shared provider call
        # while another identical request is waiting for the same result.
        result = await asyncio.shield(task)
        if shared:
            return replace(result, input_tokens=0, output_tokens=0, cache_hit=True)
        return result

    async def _settle_generation(
        self,
        key: tuple[str, ...],
        task: asyncio.Task[AssistantWidgetResult],
        ttl_seconds: float,
    ) -> None:
        try:
            result = task.result()
        except asyncio.CancelledError:
            result = None
        except Exception:
            result = None
        async with self._lock:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)
            if result is None or not ttl_seconds:
                return
            while len(self._cache) >= MAX_WIDGET_CACHE_ENTRIES:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (self.clock() + ttl_seconds, result)

    async def _generate(
        self,
        *,
        kind: Literal["weather", "currency"],
        prompt: str,
        candidate_type: type[WeatherCandidate] | type[CurrencyCandidate],
    ) -> AssistantWidgetResult:
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_json_schema=candidate_type.model_json_schema(by_alias=True),
            tools=[types.Tool(google_search=types.GoogleSearch())],
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
                include_thoughts=False,
            ),
        )
        try:
            response = await asyncio.wait_for(
                self.client.aio.models.generate_content(
                    model=RESEARCH_MODEL,
                    contents=prompt,
                    config=config,
                ),
                timeout=self.deadline_seconds,
            )
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_DEADLINE", retryable=True
            ) from None
        except Exception:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_PROVIDER_FAILED", retryable=True
            ) from None
        raw = _response_text(response)
        if raw is None:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_UNGROUNDED", retryable=True
            )
        try:
            payload = candidate_type.model_validate(json.loads(raw))
        except (TypeError, ValueError, json.JSONDecodeError):
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
            ) from None
        required_fragments = (
            (payload.location, payload.temperature, payload.condition)
            if isinstance(payload, WeatherCandidate)
            else (payload.base, payload.quote, payload.rate)
        )
        source = _grounded_source(response, required_fragments=required_fragments)
        if source is None:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_UNGROUNDED", retryable=True
            )
        version = getattr(response, "model_version", None)
        if not isinstance(version, str) or not re.fullmatch(
            r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", version
        ):
            version = None
        return AssistantWidgetResult(
            kind=kind,
            payload=payload,
            source=source,
            model=RESEARCH_MODEL,
            model_version=version,
            input_tokens=_usage_value(response, "prompt_token_count"),
            output_tokens=_usage_value(response, "candidates_token_count"),
        )

    async def close(self) -> None:
        async with self._lock:
            pending = list(self._inflight.values())
            self._inflight.clear()
            self._cache.clear()
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        if not self._owns_client:
            return
        close = getattr(getattr(self.client, "aio", None), "aclose", None)
        if callable(close):
            await close()
        sync_close = getattr(self.client, "close", None)
        if callable(sync_close):
            sync_close()


__all__ = [
    "AssistantWidgetError",
    "AssistantWidgetResult",
    "CurrencyCandidate",
    "GeminiAssistantWidgetRunner",
    "WeatherCandidate",
    "WeatherForecastCandidate",
    "WidgetSource",
]
