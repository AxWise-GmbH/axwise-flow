"""Fast grounded weather and currency cards for explicit Assistant V2 requests."""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Awaitable, Callable, Literal, TypeVar
from urllib.parse import urlsplit

from google import genai
from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.domain.workflow_v2.contracts import is_canonical_public_https_url
from backend.services.llm.gemini_runtime import RESEARCH_MODEL


TEMPERATURE_PATTERN = r"^-?(?:0|[1-9][0-9]{0,2})(?:\.[0-9]{1,2})?$"
UNSIGNED_DECIMAL_PATTERN = r"^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,12})?$"
MONEY_AMOUNT_PATTERN = r"^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$"
DEFAULT_WIDGET_DEADLINE_SECONDS = 25.0
DEFAULT_WIDGET_EVIDENCE_STAGE_SECONDS = 9.0
DEFAULT_WEATHER_TTL_SECONDS = 300.0
DEFAULT_CURRENCY_TTL_SECONDS = 900.0
MAX_WIDGET_CACHE_ENTRIES = 256
MAX_WEATHER_AGE = timedelta(hours=24)
MAX_CURRENCY_AGE = timedelta(days=7)
MAX_FUTURE_SKEW = timedelta(minutes=10)
_StageResult = TypeVar("_StageResult")


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
    search_calls: int
    cache_hit: bool = False


@dataclass(frozen=True)
class _CitedEvidence:
    source: WidgetSource
    linked_text: str


def _usage_value(response: Any, name: str) -> int | None:
    usage = getattr(response, "usage", None)
    value = getattr(usage, name, None)
    return value if type(value) is int and value >= 0 else None


def _combined_usage_value(responses: tuple[Any, ...], name: str) -> int | None:
    values = [
        value
        for response in responses
        if (value := _usage_value(response, name)) is not None
    ]
    return sum(values) if values else None


def _search_call_count(response: Any) -> int:
    calls = 0
    for step in getattr(response, "steps", None) or []:
        if getattr(step, "type", None) != "google_search_call":
            continue
        arguments = getattr(step, "arguments", None)
        queries = (
            arguments.get("queries")
            if isinstance(arguments, dict)
            else getattr(arguments, "queries", None)
        )
        calls += len(queries) if isinstance(queries, (list, tuple)) and queries else 1
    return calls


def _response_text(response: Any) -> str | None:
    value = getattr(response, "output_text", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _cited_source(
    response: Any, *, required_fragments: tuple[str, ...]
) -> _CitedEvidence | None:
    """Return one source whose own annotations cover every required value.

    Interactions citations are byte ranges over model-output text. Segments from
    separate annotations may be combined only when they point to the same public
    HTTPS URL. Evidence from a second URL can never authorize values attributed
    to the returned source.
    """

    normalized_fragments = tuple(fragment.casefold() for fragment in required_fragments)
    cited_text_by_url: dict[str, list[str]] = {}
    sources_by_url: dict[str, WidgetSource] = {}
    for step in getattr(response, "steps", None) or []:
        if getattr(step, "type", None) != "model_output":
            continue
        for content in getattr(step, "content", None) or []:
            if getattr(content, "type", None) != "text":
                continue
            text = getattr(content, "text", None)
            if not isinstance(text, str) or not text:
                continue
            encoded = text.encode("utf-8")
            for annotation in getattr(content, "annotations", None) or []:
                if getattr(annotation, "type", None) != "url_citation":
                    continue
                uri = getattr(annotation, "url", None)
                if not isinstance(uri, str) or not is_canonical_public_https_url(uri):
                    continue
                start = getattr(annotation, "start_index", None)
                end = getattr(annotation, "end_index", None)
                if (
                    type(start) is not int
                    or type(end) is not int
                    or start < 0
                    or end <= start
                    or end > len(encoded)
                ):
                    continue
                try:
                    segment_text = encoded[start:end].decode("utf-8")
                except UnicodeDecodeError:
                    continue
                if not segment_text.strip():
                    continue
                raw_title = getattr(annotation, "title", None)
                title = raw_title.strip()[:500] if isinstance(raw_title, str) else ""
                if not title:
                    title = (urlsplit(uri).hostname or "Source")[:500]
                cited_text_by_url.setdefault(uri, []).append(segment_text)
                sources_by_url.setdefault(uri, WidgetSource(title=title, url=uri))
    for uri, cited_text in cited_text_by_url.items():
        linked_text = " ".join(cited_text).casefold()
        if all(fragment in linked_text for fragment in normalized_fragments):
            return _CitedEvidence(
                source=sources_by_url[uri], linked_text=linked_text
            )
    return None


def _core_evidence_fragments(
    payload: WeatherCandidate | CurrencyCandidate,
) -> tuple[str, ...]:
    if isinstance(payload, WeatherCandidate):
        return payload.location, payload.temperature, payload.condition
    return (
        payload.base,
        payload.quote,
        payload.amount,
        payload.converted_amount,
        payload.rate,
        payload.as_of,
    )


def _source_supported_payload(
    payload: WeatherCandidate | CurrencyCandidate, linked_text: str
) -> WeatherCandidate | CurrencyCandidate:
    def covered(value: str | None) -> bool:
        return value is not None and value.casefold() in linked_text

    if isinstance(payload, CurrencyCandidate):
        return payload.model_copy(
            update={
                "inverse_rate": (
                    payload.inverse_rate if covered(payload.inverse_rate) else None
                )
            }
        )
    forecast: list[WeatherForecastCandidate] = []
    for item in payload.forecast:
        if not covered(item.label) or not covered(item.condition):
            continue
        forecast.append(
            item.model_copy(
                update={
                    "high": item.high if covered(item.high) else None,
                    "low": item.low if covered(item.low) else None,
                }
            )
        )
    return payload.model_copy(
        update={
            "high": payload.high if covered(payload.high) else None,
            "low": payload.low if covered(payload.low) else None,
            "forecast": forecast,
        }
    )


def _labeled_evidence_value(text: str, label: str) -> str | None:
    match = re.search(
        rf"^\s*(?:[-*]\s*)?(?:\*\*)?{re.escape(label)}(?:\*\*)?\s*:\s*(.+?)\s*$",
        text,
        flags=re.IGNORECASE | re.MULTILINE,
    )
    if match is None:
        return None
    value = match.group(1).strip()
    return value or None


def _parse_temperature(value: str | None, unit: Literal["C", "F"]) -> str | None:
    if value is None:
        return None
    match = re.fullmatch(
        rf"({TEMPERATURE_PATTERN[1:-1]})\s*°?\s*([CF])",
        value,
        flags=re.IGNORECASE,
    )
    if match is None or match.group(2).upper() != unit:
        return None
    return match.group(1)


def _parse_optional_temperature(
    value: str | None, unit: Literal["C", "F"]
) -> str | None:
    if value is None:
        return None
    return _parse_temperature(value, unit)


def _parse_weather_evidence(
    evidence: str,
    *,
    temperature_unit: Literal["C", "F"],
    retrieved_at: datetime,
) -> WeatherCandidate | None:
    location = _labeled_evidence_value(evidence, "Location")
    temperature = _parse_temperature(
        _labeled_evidence_value(evidence, "Current temperature"),
        temperature_unit,
    )
    condition = _labeled_evidence_value(evidence, "Condition")
    if location is None or temperature is None or condition is None:
        return None
    high_raw = _labeled_evidence_value(evidence, "High")
    low_raw = _labeled_evidence_value(evidence, "Low")
    high = _parse_optional_temperature(high_raw, temperature_unit)
    low = _parse_optional_temperature(low_raw, temperature_unit)
    if (high_raw is not None and high is None) or (
        low_raw is not None and low is None
    ):
        return None
    forecast: list[dict[str, str | None]] = []
    forecast_raw = _labeled_evidence_value(evidence, "Forecast")
    if forecast_raw is not None:
        for entry in forecast_raw.split(";"):
            parts = [part.strip() for part in entry.split("|")]
            if len(parts) not in {2, 4} or not parts[0] or not parts[1]:
                return None
            forecast_high = (
                _parse_optional_temperature(parts[2] or None, temperature_unit)
                if len(parts) == 4
                else None
            )
            forecast_low = (
                _parse_optional_temperature(parts[3] or None, temperature_unit)
                if len(parts) == 4
                else None
            )
            if len(parts) == 4 and (
                (parts[2] and forecast_high is None)
                or (parts[3] and forecast_low is None)
            ):
                return None
            forecast.append(
                {
                    "label": parts[0],
                    "condition": parts[1],
                    "high": forecast_high,
                    "low": forecast_low,
                }
            )
    try:
        return WeatherCandidate.model_validate(
            {
                "location": location,
                "observedAt": retrieved_at.isoformat(),
                "temperatureUnit": temperature_unit,
                "temperature": temperature,
                "condition": condition,
                "high": high,
                "low": low,
                "forecast": forecast,
            }
        )
    except ValueError:
        return None


def _parse_currency_evidence(evidence: str) -> CurrencyCandidate | None:
    try:
        return CurrencyCandidate.model_validate(
            {
                "base": _labeled_evidence_value(evidence, "Base"),
                "quote": _labeled_evidence_value(evidence, "Quote"),
                "amount": _labeled_evidence_value(evidence, "Amount"),
                "convertedAmount": _labeled_evidence_value(
                    evidence, "Converted amount"
                ),
                "rate": _labeled_evidence_value(evidence, "Rate"),
                "inverseRate": _labeled_evidence_value(evidence, "Inverse rate"),
                "asOf": _labeled_evidence_value(evidence, "As of"),
            }
        )
    except ValueError:
        return None


class GeminiAssistantWidgetRunner:
    """Cited live lookup with deterministic parsing and short-lived caching."""

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
        self._waiters: dict[tuple[str, ...], int] = {}
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
            "Use up to two focused Google searches for the current weather. Prefer authoritative "
            "meteorological sources. Return only compact factual lines whose values are covered by "
            "URL citations: Location: <place>; Current temperature: <decimal immediately followed "
            "by C or F>; Condition: <80 characters or fewer>. These three lines are mandatory. "
            "Optional lines are High: <decimal+unit>, Low: <decimal+unit>, and Forecast: "
            "<label>|<condition>|<high+unit>|<low+unit>, with semicolons between forecast entries. "
            "Omit unavailable optional lines. Do not add explanations or placeholders. "
            f"Location: {normalized}. Temperature unit: {temperature_unit}. "
            "Keep every condition and forecast label to 80 characters or fewer."
        )
        return await self._cached_generate(
            key,
            self.weather_ttl_seconds,
            kind="weather",
            prompt=prompt,
            requested_temperature_unit=temperature_unit,
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
            "Use up to two focused Google searches for the latest current exchange rate using an "
            "authoritative source. Reply with short natural-language evidence whose factual values "
            "are covered by URL citations. Use these exact labeled lines: Base, Quote, Amount, "
            "Rate, Converted amount, Inverse rate, As of. All except Inverse rate are mandatory. "
            "As of must be offset-aware ISO 8601. Use plain decimals without grouping separators. "
            "Omit Inverse rate when unavailable. Do not add explanations or placeholders. "
            f"Convert {amount} {base} to {quote}."
        )
        result = await self._cached_generate(
            key,
            self.currency_ttl_seconds,
            kind="currency",
            prompt=prompt,
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
        requested_temperature_unit: Literal["C", "F"] | None = None,
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
                    cached[1],
                    input_tokens=0,
                    output_tokens=0,
                    search_calls=0,
                    cache_hit=True,
                )
            task = self._inflight.get(key)
            shared = task is not None
            if task is None:

                async def generate_and_validate() -> AssistantWidgetResult:
                    result = await self._generate(
                        kind=kind,
                        prompt=prompt,
                        requested_temperature_unit=requested_temperature_unit,
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
            self._waiters[key] = self._waiters.get(key, 0) + 1
        # A cancelled desktop request must not cancel the shared provider call
        # while another identical request is waiting for the same result.
        try:
            result = await asyncio.shield(task)
        finally:
            await self._release_waiter(key, task)
        if shared:
            return replace(
                result,
                input_tokens=0,
                output_tokens=0,
                search_calls=0,
                cache_hit=True,
            )
        return result

    async def _release_waiter(
        self,
        key: tuple[str, ...],
        task: asyncio.Task[AssistantWidgetResult],
    ) -> None:
        cancel = False
        async with self._lock:
            remaining = self._waiters.get(key, 0) - 1
            if remaining > 0:
                self._waiters[key] = remaining
            else:
                self._waiters.pop(key, None)
                if not task.done() and self._inflight.get(key) is task:
                    self._inflight.pop(key, None)
                    cancel = True
        if cancel:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

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
        requested_temperature_unit: Literal["C", "F"] | None,
    ) -> AssistantWidgetResult:
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        retrieved_at = self.now()
        if not isinstance(retrieved_at, datetime) or retrieved_at.tzinfo is None:
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
            )
        retrieved_at = retrieved_at.astimezone(timezone.utc).replace(microsecond=0)

        async def run_stage(
            factory: Callable[[], Awaitable[_StageResult]], budget_seconds: float
        ) -> _StageResult:
            remaining = self.deadline_seconds - (loop.time() - started_at)
            if remaining <= 0:
                raise asyncio.TimeoutError
            return await asyncio.wait_for(
                factory(), timeout=min(budget_seconds, remaining)
            )

        async def evidence_interaction(input_text: str) -> Any:
            return await run_stage(
                lambda: self.client.aio.interactions.create(
                    model=RESEARCH_MODEL,
                    input=input_text,
                    tools=[{"type": "google_search"}],
                    generation_config={"thinking_level": "low"},
                    store=False,
                ),
                DEFAULT_WIDGET_EVIDENCE_STAGE_SECONDS,
            )

        async def generate_stages() -> tuple[
            tuple[Any, ...],
            WeatherCandidate | CurrencyCandidate,
            WidgetSource,
        ]:
            evidence_responses: list[Any] = []
            for attempt in range(2):
                evidence_prompt = prompt
                if attempt:
                    evidence_prompt += (
                        "\n\nThe previous result could not be parsed or cited. Try again using a "
                        "different authoritative source and return only the exact labeled lines."
                    )
                candidate_response = await evidence_interaction(evidence_prompt)
                evidence_responses.append(candidate_response)
                candidate_evidence = _response_text(candidate_response)
                if candidate_evidence is None:
                    continue
                payload: WeatherCandidate | CurrencyCandidate | None
                if kind == "weather":
                    if requested_temperature_unit is None:
                        raise AssistantWidgetError(
                            "AXWISE_ASSISTANT_WIDGET_INVALID_OUTPUT", retryable=True
                        )
                    payload = _parse_weather_evidence(
                        candidate_evidence,
                        temperature_unit=requested_temperature_unit,
                        retrieved_at=retrieved_at,
                    )
                else:
                    payload = _parse_currency_evidence(candidate_evidence)
                if payload is None:
                    continue
                cited = _cited_source(
                    candidate_response,
                    required_fragments=_core_evidence_fragments(payload),
                )
                if cited is not None:
                    return (
                        tuple(evidence_responses),
                        _source_supported_payload(payload, cited.linked_text),
                        cited.source,
                    )
            raise AssistantWidgetError(
                "AXWISE_ASSISTANT_WIDGET_UNGROUNDED", retryable=True
            )

        try:
            evidence_responses, payload, source = (
                await asyncio.wait_for(
                    generate_stages(),
                    timeout=self.deadline_seconds,
                )
            )
        except AssistantWidgetError:
            raise
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
        version = getattr(evidence_responses[-1], "model", None)
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
            input_tokens=_combined_usage_value(
                evidence_responses, "total_input_tokens"
            ),
            output_tokens=_combined_usage_value(
                evidence_responses, "total_output_tokens"
            ),
            search_calls=sum(
                _search_call_count(response) for response in evidence_responses
            ),
        )

    async def close(self) -> None:
        async with self._lock:
            pending = list(self._inflight.values())
            self._inflight.clear()
            self._waiters.clear()
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
