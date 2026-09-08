"""
Gemini Search Service - Uses Google Search grounding for real-time information.

Leverages Gemini's built-in Google Search tool for fetching current news,
events, and up-to-date information about locations, companies, and topics.

Note: Google Search grounding does NOT support response_mime_type='application/json'.
We must parse the markdown response manually into structured data.
"""

import asyncio
import os
import re
import logging
import hashlib
import math
import threading
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from itertools import islice
from typing import Optional, Dict, Any, List, Callable
from urllib.parse import urlparse

import httpx

from backend.domain.workflow_v2.contracts import is_canonical_public_https_url
from backend.services.llm.gemini_runtime import (
    RESEARCH_MODEL,
    require_search_model,
)

logger = logging.getLogger(__name__)


GEMINI_SEARCH_MAX_ATTEMPTS = 3
GEMINI_SEARCH_OPERATION_SECONDS = 120.0
GEMINI_SEARCH_ATTEMPT_SECONDS = 60.0
# Local retry policy, not a claimed provider minimum. Do not spend another
# provider call on the final few seconds of an almost-exhausted operation.
GEMINI_SEARCH_MIN_RETRY_SECONDS = 5.0
GEMINI_SEARCH_MAX_RETRY_AFTER_SECONDS = 20.0
GEMINI_GROUNDING_REDIRECT_SECONDS = 2.0
GEMINI_SEARCH_REDIRECT_PHASE_SECONDS = 20.0
GEMINI_SEARCH_PARSE_SECONDS = 5.0
GEMINI_SEARCH_NORMALIZATION_SECONDS = (
    GEMINI_SEARCH_REDIRECT_PHASE_SECONDS + GEMINI_SEARCH_PARSE_SECONDS
)
GEMINI_SEARCH_MAX_GROUNDING_CHUNKS = 10
GEMINI_SEARCH_MAX_GROUNDING_SUPPORTS = 50
GEMINI_SEARCH_MAX_PROVIDER_QUERIES = 20
GEMINI_SEARCH_MAX_RESPONSE_PARTS = 50
TRUSTED_GEMINI_GROUNDING_REDIRECT_HOSTS = frozenset(
    {
        "vertexaisearch.cloud.google.com",
        "grounding-api-redirect.googleusercontent.com",
    }
)
GEMINI_SEARCH_TRANSIENT_STATUS_CODES = frozenset(
    {408, 429, 500, 502, 503, 504}
)


def _trusted_grounding_redirect(value: str) -> bool:
    if not is_canonical_public_https_url(value):
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return bool(
        parsed.hostname in TRUSTED_GEMINI_GROUNDING_REDIRECT_HOSTS
    )


def _safe_resolved_https_url(value: str) -> str | None:
    """Validate a redirect Location without connecting to the destination."""

    if not is_canonical_public_https_url(value):
        return None
    host = (urlparse(value).hostname or "").casefold()
    if host in TRUSTED_GEMINI_GROUNDING_REDIRECT_HOSTS:
        return None
    return value


def _new_grounding_redirect_client() -> httpx.Client:
    return httpx.Client(
        follow_redirects=False,
        timeout=httpx.Timeout(GEMINI_GROUNDING_REDIRECT_SECONDS),
        limits=httpx.Limits(max_connections=4, max_keepalive_connections=2),
        trust_env=False,
    )


class _GroundedSearchRuntimeError(RuntimeError):
    """Internal failure carrying safe, structured request diagnostics."""

    def __init__(
        self,
        *,
        status: str,
        diagnostics: Dict[str, Any],
        cause: BaseException,
        response_metering: Dict[str, Any] | None = None,
    ) -> None:
        super().__init__(f"Gemini grounded search failed: {status}")
        self.status = status
        self.diagnostics = diagnostics
        self.cause = cause
        self.response_metering = response_metering


def _validated_http_status_code(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        status_code = value
    elif isinstance(value, str) and re.fullmatch(r"[0-9]{3}", value):
        status_code = int(value)
    else:
        return None
    return status_code if 100 <= status_code <= 599 else None


def _search_status_code(error: BaseException) -> Optional[int]:
    for candidate in (
        getattr(error, "status_code", None),
        getattr(error, "code", None),
        getattr(getattr(error, "response", None), "status_code", None),
    ):
        status_code = _validated_http_status_code(candidate)
        if status_code is not None:
            return status_code
    return None


def _is_transient_search_error(error: BaseException) -> bool:
    status_code = _search_status_code(error)
    if status_code is not None:
        return status_code in GEMINI_SEARCH_TRANSIENT_STATUS_CODES
    return isinstance(
        error,
        (
            TimeoutError,
            ConnectionError,
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.RemoteProtocolError,
        ),
    )


def _retry_after_seconds(error: BaseException) -> Optional[float]:
    response = getattr(error, "response", None)
    headers = getattr(response, "headers", None)
    if not headers:
        return None
    value = headers.get("Retry-After") or headers.get("retry-after")
    if not value:
        return None
    try:
        return min(
            max(0.0, float(value)),
            GEMINI_SEARCH_MAX_RETRY_AFTER_SECONDS,
        )
    except (TypeError, ValueError):
        pass
    try:
        retry_at = parsedate_to_datetime(str(value))
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return min(
            max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds()),
            GEMINI_SEARCH_MAX_RETRY_AFTER_SECONDS,
        )
    except (TypeError, ValueError, OverflowError):
        return None


def _log_transient_search_retry(
    *,
    model: str,
    call_count: int,
    retry_in_seconds: float,
    error: BaseException,
    upstream_status_code: int | None,
) -> None:
    status_code = _validated_http_status_code(upstream_status_code)
    if status_code is None:
        logger.warning(
            "Gemini grounded search transient failure; "
            "route=gemini_google_search model=%s call_count=%s "
            "retry_in_seconds=%.3f error_type=%s",
            model,
            call_count,
            retry_in_seconds,
            type(error).__name__,
        )
        return
    logger.warning(
        "Gemini grounded search transient failure; "
        "route=gemini_google_search model=%s call_count=%s "
        "retry_in_seconds=%.3f error_type=%s upstream_status_code=%s",
        model,
        call_count,
        retry_in_seconds,
        type(error).__name__,
        status_code,
    )


def _log_grounded_search_failure(
    diagnostics: Dict[str, Any],
    error: BaseException,
) -> None:
    status_code = _validated_http_status_code(
        diagnostics.get("upstream_status_code")
    )
    if status_code is None:
        logger.error(
            "Gemini grounded search failed; route=%s model=%s status=%s "
            "elapsed_ms=%s call_count=%s error_type=%s",
            diagnostics["route"],
            diagnostics["model"],
            diagnostics["status"],
            diagnostics["elapsed_ms"],
            diagnostics["call_count"],
            type(error).__name__,
        )
        return
    logger.error(
        "Gemini grounded search failed; route=%s model=%s status=%s "
        "elapsed_ms=%s call_count=%s error_type=%s upstream_status_code=%s",
        diagnostics["route"],
        diagnostics["model"],
        diagnostics["status"],
        diagnostics["elapsed_ms"],
        diagnostics["call_count"],
        type(error).__name__,
        status_code,
    )


def _log_grounded_search_attempt(
    *,
    model: str,
    call_count: int,
    phase: str,
    timeout_seconds: float,
    remaining_seconds: float,
    elapsed_seconds: float = 0.0,
    error: BaseException | None = None,
) -> None:
    """Content-free local diagnostics; never log prompts, bodies or headers."""

    log = (
        logger.warning if phase in {"failed", "retry_budget_exhausted"} else logger.info
    )
    message = (
        "Gemini grounded search attempt; route=gemini_google_search "
        "model=%s call_count=%s phase=%s timeout_ms=%s remaining_ms=%s "
        "elapsed_ms=%s"
    )
    values = [
        model,
        call_count,
        phase,
        max(0, int(timeout_seconds * 1000)),
        max(0, int(remaining_seconds * 1000)),
        max(0, round(elapsed_seconds * 1000)),
    ]
    status_code = _search_status_code(error) if error is not None else None
    if status_code is not None:
        message += " upstream_status_code=%s"
        values.append(status_code)
    log(message, *values)


def _normalized_usage_metadata(response: Any) -> Dict[str, int]:
    """Return only non-sensitive Gemini usage counters in the shared wire shape."""

    metadata = getattr(response, "usage_metadata", None)
    if metadata is None:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}

    def counter(*names: str) -> int:
        for name in names:
            value = (
                metadata.get(name)
                if isinstance(metadata, dict)
                else getattr(metadata, name, None)
            )
            if value is not None:
                try:
                    return max(0, int(value))
                except (TypeError, ValueError):
                    return 0
        return 0

    prompt_tokens = counter(
        "prompt_token_count", "promptTokenCount", "input_tokens", "inputTokens"
    )
    tool_prompt_tokens = counter(
        "tool_use_prompt_token_count", "toolUsePromptTokenCount"
    )
    input_tokens = prompt_tokens + tool_prompt_tokens
    candidate_tokens = counter(
        "candidates_token_count",
        "candidatesTokenCount",
        "output_tokens",
        "outputTokens",
    )
    thinking_tokens = counter("thoughts_token_count", "thoughtsTokenCount")
    output_tokens = candidate_tokens + thinking_tokens
    total_tokens = counter(
        "total_token_count", "totalTokenCount", "total_tokens", "totalTokens"
    )
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens or input_tokens + output_tokens,
    }


def _provider_model_version(response: Any) -> str | None:
    """Read the exact served model version without copying unbounded metadata."""

    value = getattr(response, "model_version", None)
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > 200:
        return None
    return normalized


def _validated_response_defects(value: Any) -> tuple[str, ...]:
    if (
        not isinstance(value, tuple)
        or len(value) > 12
        or any(
            not isinstance(code, str)
            or re.fullmatch(r"[a-z][a-z0-9_]{0,79}", code) is None
            for code in value
        )
    ):
        raise ValueError("Invalid response-policy result")
    return value


class _ResponseMetering:
    """Operation-local accounting for accepted and rejected provider responses.

    Only counters/version labels are retained. Rejected prose and grounding URLs
    never become part of the accepted response's provenance or repair prompt.
    """

    def __init__(self) -> None:
        self.responses = 0
        self.complete = True
        self.input_tokens = 0
        self.output_tokens = 0
        self.total_tokens = 0
        self.search_calls = 0
        self.versions: list[str | None] = []

    def record(self, response: Any) -> None:
        self.responses += 1
        metadata = getattr(response, "usage_metadata", None)

        def present(*names: str) -> bool:
            return any(
                type(value) is int and value >= 0
                for name in names
                for value in [metadata.get(name) if isinstance(metadata, dict) else getattr(metadata, name, None)]
            )

        self.complete = self.complete and present(
            "prompt_token_count", "promptTokenCount", "input_tokens", "inputTokens"
        ) and present(
            "candidates_token_count", "candidatesTokenCount", "output_tokens",
            "outputTokens", "total_token_count", "totalTokenCount", "total_tokens", "totalTokens"
        )
        for name in (
            "prompt_token_count", "promptTokenCount", "input_tokens", "inputTokens",
            "candidates_token_count", "candidatesTokenCount", "output_tokens", "outputTokens",
            "total_token_count", "totalTokenCount", "total_tokens", "totalTokens",
            "tool_use_prompt_token_count", "toolUsePromptTokenCount",
            "thoughts_token_count", "thoughtsTokenCount",
        ):
            value = metadata.get(name) if isinstance(metadata, dict) else getattr(metadata, name, None)
            if value is not None and (type(value) is not int or value < 0):
                self.complete = False
        try:
            usage = _normalized_usage_metadata(response)
        except (TypeError, ValueError, OverflowError):
            self.complete = False
            usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
        self.input_tokens += usage["input_tokens"]
        output = max(usage["output_tokens"], usage["total_tokens"] - usage["input_tokens"])
        self.output_tokens += output
        self.total_tokens += max(usage["total_tokens"], usage["input_tokens"] + output)
        candidates = getattr(response, "candidates", None) or []
        grounding = getattr(candidates[0], "grounding_metadata", None) if candidates else None
        self.search_calls += sum(
            1 for _ in islice(
                getattr(grounding, "web_search_queries", None) or [],
                GEMINI_SEARCH_MAX_PROVIDER_QUERIES,
            )
        )
        self.versions.append(_provider_model_version(response))

    def snapshot(self, call_count: int) -> Dict[str, Any]:
        all_responses = self.responses == call_count
        complete = self.complete and all_responses
        version = (
            self.versions[0]
            if all_responses and self.versions
            and self.versions[0] is not None
            and all(value == self.versions[0] for value in self.versions)
            else None
        )
        return {
            "usage_metadata": {
                "input_tokens": self.input_tokens if complete else None,
                "output_tokens": self.output_tokens if complete else None,
                "total_tokens": self.total_tokens if complete else None,
                "search_calls": self.search_calls if all_responses else None,
                "usage_complete": complete,
            },
            "model_version": version,
        }


def _with_response_metering(
    result: Dict[str, Any], metering: Dict[str, Any] | None
) -> Dict[str, Any]:
    if metering is None:
        return result
    usage = dict(metering["usage_metadata"])
    result["usage_metadata"] = usage
    diagnostics = result.get("runtime_diagnostics")
    if isinstance(diagnostics, dict):
        diagnostics["usage_complete"] = usage["usage_complete"]
        for key in ("input_tokens", "output_tokens", "total_tokens"):
            if type(usage[key]) is int and 0 <= usage[key] <= 2_000_000:
                diagnostics[key] = usage[key]
    if metering["model_version"] is not None:
        result["model_version"] = metering["model_version"]
    else:
        result.pop("model_version", None)
    return result


def parse_news_markdown(text: str) -> List[Dict[str, Any]]:
    """
    Parse Gemini's markdown-formatted news response into structured news items.

    Expected format from Gemini:
    *   **Category: Headline**
        Details paragraph...

    Or with date:
    *   **Category (Date): Headline**
        Details...
    """
    if not text:
        return []

    news_items = []

    # Pattern to match bullet points with bold titles
    # Matches: *   **Category: Title** or * **Category (Date): Title**
    bullet_pattern = re.compile(
        r'^\s*\*\s+\*\*([^:*]+?)(?:\s*\(([^)]+)\))?:\s*(.+?)\*\*\s*$',
        re.MULTILINE
    )

    lines = text.split('\n')
    current_item = None

    for line in lines:
        # Check for bullet point with bold header
        bullet_match = bullet_pattern.match(line)

        if bullet_match:
            # Save previous item
            if current_item:
                news_items.append(current_item)

            category_raw = bullet_match.group(1).strip()
            date = bullet_match.group(2)  # May be None
            headline = bullet_match.group(3).strip()

            # Normalize category
            category = normalize_category(category_raw)

            current_item = {
                "category": category,
                "headline": headline,
                "details": "",
                "date": date.strip() if date else None,
                "source_hint": None
            }
        elif current_item:
            # Add content to current item's details
            stripped = line.strip()
            if stripped:
                if current_item["details"]:
                    current_item["details"] += " " + stripped
                else:
                    current_item["details"] = stripped

    # Don't forget the last item
    if current_item:
        news_items.append(current_item)

    # If no structured items found, try alternative parsing
    if not news_items:
        news_items = parse_news_fallback(text)

    return news_items


def parse_news_fallback(text: str) -> List[Dict[str, Any]]:
    """
    Fallback parser for less structured responses.
    Splits by double newlines and tries to extract category/headline from bold text.
    """
    news_items = []

    # Split into paragraphs
    paragraphs = re.split(r'\n\s*\n', text)

    for para in paragraphs:
        para = para.strip()
        if not para or len(para) < 20:
            continue

        # Try to find bold title: **Title** or **Category: Title**
        bold_match = re.search(r'\*\*(.+?)\*\*', para)

        if bold_match:
            title_text = bold_match.group(1)

            # Check if it has category prefix
            if ':' in title_text:
                parts = title_text.split(':', 1)
                category = normalize_category(parts[0].strip())
                headline = parts[1].strip()
            else:
                category = "News"
                headline = title_text

            # Details is everything after the bold title
            details = para[bold_match.end():].strip()
            # Remove leading bullet/asterisk
            details = re.sub(r'^[\s*-]+', '', details).strip()

            news_items.append({
                "category": category,
                "headline": headline,
                "details": details,
                "date": None,
                "source_hint": None
            })

    return news_items


def normalize_category(raw_category: str) -> str:
    """Normalize category names to standard values."""
    cat_lower = raw_category.lower()

    if 'sport' in cat_lower or 'football' in cat_lower or 'soccer' in cat_lower:
        return "Sports"
    if 'transport' in cat_lower or 'infrastructure' in cat_lower or 'train' in cat_lower or 'rail' in cat_lower:
        return "Transportation"
    if 'econom' in cat_lower or 'business' in cat_lower or 'financial' in cat_lower:
        return "Economic"
    if 'event' in cat_lower or 'festival' in cat_lower or 'concert' in cat_lower:
        return "Events"
    if 'weather' in cat_lower or 'climate' in cat_lower:
        return "Weather"
    if 'politic' in cat_lower or 'government' in cat_lower or 'election' in cat_lower:
        return "Political"
    if 'local' in cat_lower:
        return "Local News"

    # Return cleaned up original if no match
    return raw_category.title().replace(' News', '').strip() or "News"


class GeminiSearchService:
    """
    Service for performing grounded web searches using Gemini's Google Search tool.

    This uses Gemini 3.8 Flash's native integration with Google Search for real-time
    information retrieval - no external search APIs needed.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        search_operation_seconds: float = GEMINI_SEARCH_OPERATION_SECONDS,
        search_attempt_seconds: float = GEMINI_SEARCH_ATTEMPT_SECONDS,
        response_validator: Callable[[str, str], tuple[str, ...]] | None = None,
        repair_query_builder: Callable[[str, tuple[str, ...]], str] | None = None,
        parsed_response_validator: Callable[[str, Dict[str, Any]], tuple[str, ...]] | None = None,
    ):
        try:
            operation_seconds = float(search_operation_seconds)
            attempt_seconds = float(search_attempt_seconds)
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("Gemini Search time limits must be finite") from error
        if (
            not math.isfinite(operation_seconds)
            or operation_seconds <= 0
            or operation_seconds > GEMINI_SEARCH_OPERATION_SECONDS
        ):
            raise ValueError(
                "search_operation_seconds must be greater than 0 and at most "
                f"{GEMINI_SEARCH_OPERATION_SECONDS:g}"
            )
        if (
            not math.isfinite(attempt_seconds)
            or attempt_seconds <= 0
            or attempt_seconds > GEMINI_SEARCH_ATTEMPT_SECONDS
            or attempt_seconds > operation_seconds
        ):
            raise ValueError(
                "search_attempt_seconds must be greater than 0 and no greater "
                "than the operation limit or generic attempt maximum"
            )
        if (response_validator is None) != (repair_query_builder is None) or (
            response_validator is not None
            and (not callable(response_validator) or not callable(repair_query_builder))
        ):
            raise ValueError("Response validation and repair policies must be paired callables")
        self._response_validator = response_validator
        self._repair_query_builder = repair_query_builder
        if parsed_response_validator is not None and (
            not callable(parsed_response_validator) or response_validator is None
        ):
            raise ValueError("Parsed response validation requires the paired response policies")
        self._parsed_response_validator = parsed_response_validator
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._client = None
        self._search_clock = time.monotonic
        self._search_sleep = time.sleep
        self._search_async_sleep = asyncio.sleep
        self._search_operation_seconds = operation_seconds
        self._search_attempt_seconds = attempt_seconds
        self._search_max_attempts = GEMINI_SEARCH_MAX_ATTEMPTS
        self._search_redirect_seconds = GEMINI_SEARCH_REDIRECT_PHASE_SECONDS
        self._search_parse_seconds = GEMINI_SEARCH_PARSE_SECONDS
        self._grounding_redirect_lock = threading.Lock()
        try:
            from google import genai
            if self.api_key:
                self._client = genai.Client(api_key=self.api_key)
                self._async_client = self._client.aio
        except Exception as e:
            logger.warning(f"Failed to initialize Gemini client: {e}")
            self._client = None

    def is_available(self) -> bool:
        """Check if the service is available."""
        return bool(self._client)

    def close(self) -> None:
        redirect_client = getattr(self, "_grounding_redirect_client", None)
        if redirect_client is not None:
            redirect_client.close()
            self._grounding_redirect_client = None
        provider_client = getattr(self, "_client", None)
        close_provider = getattr(provider_client, "close", None)
        if callable(close_provider):
            close_provider()

    async def aclose(self) -> None:
        """Close both async and sync transports used by grounded search."""

        async_provider = getattr(self, "_async_client", None)
        close_async_provider = getattr(async_provider, "aclose", None)
        if callable(close_async_provider):
            await close_async_provider()
        self.close()

    def _resolve_grounding_redirect(self, provider_url: str) -> str | None:
        """Resolve one trusted Google redirect hop without fetching its target."""

        if not _trusted_grounding_redirect(provider_url):
            return None
        injected = getattr(self, "_grounding_redirect_resolver", None)
        if callable(injected):
            return _safe_resolved_https_url(str(injected(provider_url) or ""))
        client = getattr(self, "_grounding_redirect_client", None)
        if client is None:
            lock = getattr(self, "_grounding_redirect_lock", None)
            if lock is None:
                lock = threading.Lock()
                self._grounding_redirect_lock = lock
            with lock:
                client = getattr(self, "_grounding_redirect_client", None)
                if client is None:
                    client = _new_grounding_redirect_client()
                    self._grounding_redirect_client = client
        try:
            with client.stream(
                "GET",
                provider_url,
                headers={"User-Agent": "AxWise-Grounding-Resolver/2"},
                follow_redirects=False,
            ) as response:
                status_code = response.status_code
                location = response.headers.get("Location", "")
        except httpx.HTTPError:
            return None
        if status_code not in {301, 302, 303, 307, 308}:
            return None
        return _safe_resolved_https_url(location)

    @staticmethod
    def _grounding_redirect_urls(response: Any) -> list[str]:
        """Collect the bounded trusted redirects required by normalization."""

        candidates = getattr(response, "candidates", None) or []
        if not candidates:
            return []
        metadata = getattr(candidates[0], "grounding_metadata", None)
        if metadata is None:
            return []
        urls: list[str] = []
        seen: set[str] = set()
        chunks = getattr(metadata, "grounding_chunks", None) or []
        for chunk in islice(chunks, GEMINI_SEARCH_MAX_GROUNDING_CHUNKS):
            web = getattr(chunk, "web", None)
            raw_url = getattr(web, "uri", None) if web is not None else None
            provider_url = str(raw_url) if raw_url else ""
            if (
                provider_url
                and provider_url not in seen
                and _trusted_grounding_redirect(provider_url)
            ):
                seen.add(provider_url)
                urls.append(provider_url)
        return urls

    async def _resolve_grounding_redirects_async(
        self,
        provider_urls: list[str],
        *,
        timeout_seconds: float,
    ) -> dict[str, str | None]:
        """Resolve redirects concurrently under one cancellable wall-clock cap."""

        resolved: dict[str, str | None] = {
            provider_url: None for provider_url in provider_urls
        }
        if not provider_urls:
            return resolved

        injected = getattr(self, "_grounding_redirect_async_resolver", None)

        async def resolve_one(
            provider_url: str,
            client: httpx.AsyncClient | None,
        ) -> None:
            try:
                if callable(injected):
                    location = await injected(provider_url)
                else:
                    assert client is not None
                    async with client.stream(
                        "GET",
                        provider_url,
                        headers={"User-Agent": "AxWise-Grounding-Resolver/2"},
                        follow_redirects=False,
                    ) as response:
                        if response.status_code not in {301, 302, 303, 307, 308}:
                            return
                        location = response.headers.get("Location", "")
                resolved[provider_url] = _safe_resolved_https_url(
                    str(location or "")
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                return

        try:
            async with asyncio.timeout(timeout_seconds):
                if callable(injected):
                    async with asyncio.TaskGroup() as task_group:
                        for provider_url in provider_urls:
                            task_group.create_task(resolve_one(provider_url, None))
                else:
                    async with httpx.AsyncClient(
                        follow_redirects=False,
                        timeout=httpx.Timeout(GEMINI_GROUNDING_REDIRECT_SECONDS),
                        limits=httpx.Limits(
                            max_connections=4,
                            max_keepalive_connections=2,
                        ),
                        trust_env=False,
                    ) as client:
                        async with asyncio.TaskGroup() as task_group:
                            for provider_url in provider_urls:
                                task_group.create_task(
                                    resolve_one(provider_url, client)
                                )
        except TimeoutError:
            # The map is deliberately complete. Unresolved entries remain None,
            # so the parser retains the provider URL without starting sync I/O.
            pass
        return resolved

    def _search_runtime_diagnostics(
        self,
        *,
        status: str,
        started_at: float,
        call_count: int,
        model: str = RESEARCH_MODEL,
        deadline_seconds: float | None = None,
        upstream_status_code: int | str | None = None,
    ) -> Dict[str, Any]:
        clock = getattr(self, "_search_clock", time.monotonic)
        operation_seconds = (
            float(deadline_seconds)
            if deadline_seconds is not None
            else float(
                getattr(
                    self,
                    "_search_operation_seconds",
                    GEMINI_SEARCH_OPERATION_SECONDS,
                )
            )
        )
        diagnostics = {
            "route": "gemini_google_search",
            "model": model,
            "status": status,
            "elapsed_ms": max(0, round((clock() - started_at) * 1000)),
            "call_count": call_count,
            "retry_count": max(0, call_count - 1),
            "deadline_ms": round(operation_seconds * 1000),
            "fallback_used": False,
        }
        validated_status_code = _validated_http_status_code(upstream_status_code)
        if validated_status_code is not None:
            diagnostics["upstream_status_code"] = validated_status_code
        return diagnostics

    def _generate_grounded_content(self, query: str) -> tuple[Any, Dict[str, Any]]:
        """Call the exact Google Search model with one bounded retry owner."""
        from google.genai import types

        clock = getattr(self, "_search_clock", time.monotonic)
        sleep = getattr(self, "_search_sleep", time.sleep)
        operation_seconds = max(
            0.001,
            min(
                float(
                    getattr(
                        self,
                        "_search_operation_seconds",
                        GEMINI_SEARCH_OPERATION_SECONDS,
                    )
                ),
                GEMINI_SEARCH_OPERATION_SECONDS,
            ),
        )
        attempt_seconds = max(
            0.001,
            min(
                float(
                    getattr(
                        self,
                        "_search_attempt_seconds",
                        GEMINI_SEARCH_ATTEMPT_SECONDS,
                    )
                ),
                GEMINI_SEARCH_ATTEMPT_SECONDS,
            ),
        )
        max_attempts = max(
            1,
            min(
                int(
                    getattr(
                        self,
                        "_search_max_attempts",
                        GEMINI_SEARCH_MAX_ATTEMPTS,
                    )
                ),
                GEMINI_SEARCH_MAX_ATTEMPTS,
            ),
        )
        started_at = clock()
        deadline = started_at + operation_seconds
        call_count = 0
        transient_failure_seen = False
        last_upstream_status_code: Optional[int] = None

        try:
            model = require_search_model()
        except Exception as error:
            diagnostics = self._search_runtime_diagnostics(
                status="configuration_error",
                started_at=started_at,
                call_count=0,
            )
            raise _GroundedSearchRuntimeError(
                status="configuration_error",
                diagnostics=diagnostics,
                cause=error,
            ) from error

        while call_count < max_attempts:
            remaining = deadline - clock()
            if remaining <= 0 or (
                call_count > 0
                and remaining < min(GEMINI_SEARCH_MIN_RETRY_SECONDS, attempt_seconds)
            ):
                _log_grounded_search_attempt(
                    model=model,
                    call_count=call_count,
                    phase="retry_budget_exhausted",
                    timeout_seconds=0,
                    remaining_seconds=remaining,
                )
                error = TimeoutError("Gemini grounded search deadline exceeded")
                diagnostics = self._search_runtime_diagnostics(
                    status="deadline_exceeded",
                    started_at=started_at,
                    call_count=call_count,
                    model=model,
                    upstream_status_code=last_upstream_status_code,
                )
                raise _GroundedSearchRuntimeError(
                    status="deadline_exceeded",
                    diagnostics=diagnostics,
                    cause=error,
                ) from error

            # The SDK defaults to five attempts. Disable that layer so this
            # bounded loop remains the only retry owner and call_count is exact.
            attempt_budget = min(attempt_seconds, remaining)
            config = types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
                http_options=types.HttpOptions(
                    timeout=max(1, int(attempt_budget * 1000)),
                    retry_options=types.HttpRetryOptions(
                        attempts=1,
                        http_status_codes=sorted(GEMINI_SEARCH_TRANSIENT_STATUS_CODES),
                    ),
                ),
            )
            call_count += 1
            attempt_started_at = clock()
            _log_grounded_search_attempt(
                model=model,
                call_count=call_count,
                phase="started",
                timeout_seconds=attempt_budget,
                remaining_seconds=remaining,
            )
            try:
                response = self._client.models.generate_content(
                    model=model,
                    contents=query,
                    config=config,
                )
            except Exception as error:
                _log_grounded_search_attempt(
                    model=model,
                    call_count=call_count,
                    phase="failed",
                    timeout_seconds=attempt_budget,
                    remaining_seconds=deadline - clock(),
                    elapsed_seconds=clock() - attempt_started_at,
                    error=error,
                )
                attempt_status_code = _search_status_code(error)
                if attempt_status_code is not None:
                    last_upstream_status_code = attempt_status_code
                transient = _is_transient_search_error(error)
                transient_failure_seen = transient_failure_seen or transient
                remaining = deadline - clock()
                if not transient:
                    # A later 4xx must not erase a transient availability
                    # failure that already occurred in this logical grounded
                    # call. Preserve the aggregate as fallback-eligible while
                    # keeping a first-call 4xx non-retryable.
                    status = (
                        "retry_exhausted"
                        if transient_failure_seen
                        else "non_retryable_error"
                    )
                elif remaining <= 0:
                    status = "deadline_exceeded"
                elif call_count >= max_attempts:
                    status = "retry_exhausted"
                else:
                    retry_after = _retry_after_seconds(error) or 0.0
                    delay = min(
                        GEMINI_SEARCH_MAX_RETRY_AFTER_SECONDS,
                        max(float(2 ** (call_count - 1)), retry_after),
                    )
                    if remaining - delay >= min(
                        GEMINI_SEARCH_MIN_RETRY_SECONDS, attempt_seconds
                    ):
                        _log_transient_search_retry(
                            model=model,
                            call_count=call_count,
                            retry_in_seconds=delay,
                            error=error,
                            upstream_status_code=attempt_status_code,
                        )
                        sleep(delay)
                        continue
                    status = "deadline_exceeded"

                diagnostics = self._search_runtime_diagnostics(
                    status=status,
                    started_at=started_at,
                    call_count=call_count,
                    model=model,
                    upstream_status_code=last_upstream_status_code,
                )
                raise _GroundedSearchRuntimeError(
                    status=status,
                    diagnostics=diagnostics,
                    cause=error,
                ) from error

            _log_grounded_search_attempt(
                model=model,
                call_count=call_count,
                phase="succeeded",
                timeout_seconds=attempt_budget,
                remaining_seconds=deadline - clock(),
                elapsed_seconds=clock() - attempt_started_at,
            )
            diagnostics = self._search_runtime_diagnostics(
                status="ok",
                started_at=started_at,
                call_count=call_count,
                model=model,
            )
            return response, diagnostics

        raise AssertionError("bounded Gemini grounded-search loop exhausted")

    async def _generate_grounded_content_async(
        self, query: str
    ) -> tuple[Any, Dict[str, Any]]:
        """Call Gemini asynchronously so cancellation reaches the HTTP request."""
        from google.genai import types

        clock = getattr(self, "_search_clock", time.monotonic)
        sleep = getattr(self, "_search_async_sleep", asyncio.sleep)
        operation_seconds = max(
            0.001,
            min(
                float(
                    getattr(
                        self,
                        "_search_operation_seconds",
                        GEMINI_SEARCH_OPERATION_SECONDS,
                    )
                ),
                GEMINI_SEARCH_OPERATION_SECONDS,
            ),
        )
        attempt_seconds = max(
            0.001,
            min(
                float(
                    getattr(
                        self,
                        "_search_attempt_seconds",
                        GEMINI_SEARCH_ATTEMPT_SECONDS,
                    )
                ),
                GEMINI_SEARCH_ATTEMPT_SECONDS,
            ),
        )
        max_attempts = max(
            1,
            min(
                int(
                    getattr(
                        self,
                        "_search_max_attempts",
                        GEMINI_SEARCH_MAX_ATTEMPTS,
                    )
                ),
                GEMINI_SEARCH_MAX_ATTEMPTS,
            ),
        )
        started_at = clock()
        deadline = started_at + operation_seconds
        loop = asyncio.get_running_loop()
        wall_clock_deadline = loop.time() + operation_seconds
        call_count = 0
        transient_failure_seen = False
        last_upstream_status_code: Optional[int] = None

        response_validator = getattr(self, "_response_validator", None)
        parsed_response_validator = getattr(self, "_parsed_response_validator", None)
        repair_query_builder = getattr(self, "_repair_query_builder", None)
        metering = _ResponseMetering() if response_validator is not None else None
        quality_repair_used = False
        request_query = query

        def runtime_error(
            *, status: str, diagnostics: Dict[str, Any], cause: BaseException
        ) -> _GroundedSearchRuntimeError:
            return _GroundedSearchRuntimeError(
                status=status,
                diagnostics=diagnostics,
                cause=cause,
                response_metering=(
                    metering.snapshot(call_count) if metering is not None else None
                ),
            )


        try:
            model = require_search_model()
        except Exception as error:
            diagnostics = self._search_runtime_diagnostics(
                status="configuration_error",
                started_at=started_at,
                call_count=0,
            )
            raise runtime_error(
                status="configuration_error",
                diagnostics=diagnostics,
                cause=error,
            ) from error

        async_client = getattr(self, "_async_client", None)
        if async_client is None:
            error = RuntimeError("Gemini async client is unavailable")
            diagnostics = self._search_runtime_diagnostics(
                status="configuration_error",
                started_at=started_at,
                call_count=0,
                model=model,
            )
            raise runtime_error(
                status="configuration_error",
                diagnostics=diagnostics,
                cause=error,
            ) from error

        while call_count < max_attempts:
            remaining = min(
                deadline - clock(),
                wall_clock_deadline - loop.time(),
            )
            if remaining <= 0 or (
                call_count > 0
                and remaining < min(GEMINI_SEARCH_MIN_RETRY_SECONDS, attempt_seconds)
            ):
                _log_grounded_search_attempt(
                    model=model,
                    call_count=call_count,
                    phase="retry_budget_exhausted",
                    timeout_seconds=0,
                    remaining_seconds=remaining,
                )
                error = TimeoutError("Gemini grounded search deadline exceeded")
                diagnostics = self._search_runtime_diagnostics(
                    status="deadline_exceeded",
                    started_at=started_at,
                    call_count=call_count,
                    model=model,
                    upstream_status_code=last_upstream_status_code,
                )
                raise runtime_error(
                    status="deadline_exceeded",
                    diagnostics=diagnostics,
                    cause=error,
                ) from error

            # The SDK defaults to five attempts. Disable that layer so this
            # bounded loop remains the only retry owner and call_count is exact.
            attempt_budget = min(attempt_seconds, remaining)
            config = types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
                http_options=types.HttpOptions(
                    timeout=max(1, int(attempt_budget * 1000)),
                    retry_options=types.HttpRetryOptions(
                        attempts=1,
                        http_status_codes=sorted(GEMINI_SEARCH_TRANSIENT_STATUS_CODES),
                    ),
                ),
            )
            call_count += 1
            attempt_started_at = clock()
            _log_grounded_search_attempt(
                model=model,
                call_count=call_count,
                phase="started",
                timeout_seconds=attempt_budget,
                remaining_seconds=remaining,
            )
            try:
                attempt_deadline = min(
                    wall_clock_deadline,
                    loop.time() + attempt_budget,
                )
                async with asyncio.timeout_at(attempt_deadline):
                    response = await async_client.models.generate_content(
                        model=model,
                        contents=request_query,
                        config=config,
                    )
            except asyncio.CancelledError:
                _log_grounded_search_attempt(
                    model=model,
                    call_count=call_count,
                    phase="cancelled",
                    timeout_seconds=attempt_budget,
                    remaining_seconds=min(
                        deadline - clock(), wall_clock_deadline - loop.time()
                    ),
                    elapsed_seconds=clock() - attempt_started_at,
                )
                raise
            except Exception as error:
                _log_grounded_search_attempt(
                    model=model,
                    call_count=call_count,
                    phase="failed",
                    timeout_seconds=attempt_budget,
                    remaining_seconds=min(
                        deadline - clock(), wall_clock_deadline - loop.time()
                    ),
                    elapsed_seconds=clock() - attempt_started_at,
                    error=error,
                )
                attempt_status_code = _search_status_code(error)
                if attempt_status_code is not None:
                    last_upstream_status_code = attempt_status_code
                transient = _is_transient_search_error(error)
                transient_failure_seen = transient_failure_seen or transient
                remaining = min(
                    deadline - clock(),
                    wall_clock_deadline - loop.time(),
                )
                if not transient:
                    # A later 4xx must not erase a transient availability
                    # failure that already occurred in this logical grounded
                    # call. Preserve the aggregate as fallback-eligible while
                    # keeping a first-call 4xx non-retryable.
                    status = (
                        "retry_exhausted"
                        if transient_failure_seen
                        else "non_retryable_error"
                    )
                elif remaining <= 0:
                    status = "deadline_exceeded"
                elif call_count >= max_attempts:
                    status = "retry_exhausted"
                else:
                    retry_after = _retry_after_seconds(error) or 0.0
                    delay = min(
                        GEMINI_SEARCH_MAX_RETRY_AFTER_SECONDS,
                        max(float(2 ** (call_count - 1)), retry_after),
                    )
                    if remaining - delay >= min(
                        GEMINI_SEARCH_MIN_RETRY_SECONDS, attempt_seconds
                    ):
                        _log_transient_search_retry(
                            model=model,
                            call_count=call_count,
                            retry_in_seconds=delay,
                            error=error,
                            upstream_status_code=attempt_status_code,
                        )
                        await sleep(delay)
                        continue
                    status = "deadline_exceeded"

                diagnostics = self._search_runtime_diagnostics(
                    status=status,
                    started_at=started_at,
                    call_count=call_count,
                    model=model,
                    upstream_status_code=last_upstream_status_code,
                )
                raise runtime_error(
                    status=status,
                    diagnostics=diagnostics,
                    cause=error,
                ) from error

            if metering is not None:
                metering.record(response)
            parsed_result = None
            if response_validator is not None:
                try:
                    defects = _validated_response_defects(
                        response_validator(query, str(response.text or ""))
                    )
                    if not defects and parsed_response_validator is not None:
                        normalization_diagnostics = self._search_runtime_diagnostics(
                            status="ok", started_at=started_at,
                            call_count=call_count, model=model,
                        )
                        try:
                            parsed_result = await self._normalize_grounded_result_async(
                                query, (response, normalization_diagnostics),
                                started_at=started_at,
                                absolute_deadline=deadline,
                                wall_clock_deadline=wall_clock_deadline,
                            )
                        except asyncio.CancelledError:
                            raise
                        except Exception as error:
                            normalization_status = (
                                "deadline_exceeded" if isinstance(error, TimeoutError)
                                else "response_processing_error"
                            )
                            raise runtime_error(
                                status=normalization_status,
                                diagnostics=self._search_runtime_diagnostics(
                                    status=normalization_status, started_at=started_at,
                                    call_count=call_count, model=model,
                                ),
                                cause=error,
                            ) from error
                        defects = _validated_response_defects(
                            parsed_response_validator(query, parsed_result)
                        )
                except _GroundedSearchRuntimeError:
                    raise
                except Exception as error:
                    raise runtime_error(
                        status="configuration_error",
                        diagnostics=self._search_runtime_diagnostics(
                            status="configuration_error", started_at=started_at,
                            call_count=call_count, model=model,
                        ),
                        cause=ValueError("Grounded response policy failed"),
                    ) from error
                if defects:
                    remaining = min(deadline - clock(), wall_clock_deadline - loop.time())
                    if (
                        quality_repair_used
                        or call_count >= max_attempts
                        or remaining < min(GEMINI_SEARCH_MIN_RETRY_SECONDS, attempt_seconds)
                    ):
                        # A returned but invalid answer is not an outage, even
                        # when no time remains to repair it. Do not poison the
                        # shared provider-availability circuit for other tasks.
                        status = "quality_rejected"
                        raise runtime_error(
                            status=status,
                            diagnostics=self._search_runtime_diagnostics(
                                status=status, started_at=started_at,
                                call_count=call_count, model=model,
                            ),
                            cause=ValueError("Grounded response failed publication policy"),
                        )
                    try:
                        repaired_query = repair_query_builder(query, defects)
                        if (
                            not isinstance(repaired_query, str)
                            or not repaired_query.strip()
                            or len(repaired_query) > len(query) + 8_000
                        ):
                            raise ValueError("Invalid response-policy repair")
                    except Exception as error:
                        raise runtime_error(
                            status="configuration_error",
                            diagnostics=self._search_runtime_diagnostics(
                                status="configuration_error", started_at=started_at,
                                call_count=call_count, model=model,
                            ),
                            cause=ValueError("Grounded response repair policy failed"),
                        ) from error
                    quality_repair_used = True
                    request_query = repaired_query
                    _log_grounded_search_attempt(
                        model=model, call_count=call_count, phase="quality_repair",
                        timeout_seconds=0, remaining_seconds=remaining,
                    )
                    # The same attempt counter, clocks, and SDK retry owner apply.
                    # Do not send rejected prose or extend the operation deadline.
                    continue

            if parsed_response_validator is not None and min(
                deadline - clock(), wall_clock_deadline - loop.time()
            ) <= 0:
                raise runtime_error(
                    status="deadline_exceeded",
                    diagnostics=self._search_runtime_diagnostics(
                        status="deadline_exceeded", started_at=started_at,
                        call_count=call_count, model=model,
                    ),
                    cause=TimeoutError("Grounded publication deadline exceeded"),
                )
            _log_grounded_search_attempt(
                model=model,
                call_count=call_count,
                phase="succeeded",
                timeout_seconds=attempt_budget,
                remaining_seconds=min(
                    deadline - clock(), wall_clock_deadline - loop.time()
                ),
                elapsed_seconds=clock() - attempt_started_at,
            )
            diagnostics = self._search_runtime_diagnostics(
                status="ok",
                started_at=started_at,
                call_count=call_count,
                model=model,
            )
            if metering is not None:
                diagnostics["_response_metering"] = metering.snapshot(call_count)
            if parsed_result is not None:
                # Operation-local cache, never an instance attribute. The public
                # wrapper consumes it without resolving redirects/parsing twice.
                diagnostics["_parsed_result"] = parsed_result
            return response, diagnostics

        raise AssertionError("bounded Gemini grounded-search loop exhausted")

    def search_location_news(
        self, location: str, days_back: int = 7, max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for recent news and events for a specific location.
        Parses markdown response into structured news items.

        Args:
            location: City, region, or country to search for
            days_back: How many days of news to look for (default: 7)
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Prompt designed for easy parsing - ask for consistent markdown format
            prompt = f"""Search for the most recent and important news from {location} from the last {days_back} days.

Return EXACTLY {max_items} news items in this EXACT format:

*   **Category (Date): Headline**
    Detailed paragraph with SPECIFIC facts...

Categories must be one of: Sports, Transportation, Economic, Events, Weather, Political

Example format:
*   **Sports (November 25, 2025): Bayern Munich defeats Dortmund 3-1**
    In a thrilling Bundesliga match at Allianz Arena, Bayern Munich secured a 3-1 victory over Borussia Dortmund. Jamal Musiala opened the scoring in the 23rd minute, followed by Harry Kane's brace at 45'+2 and 78'. Dortmund's consolation goal came from Karim Adeyemi at 82'.

*   **Transportation (November 24, 2025): Stuttgart 21 Project Faces Further Delays**
    The Stuttgart 21 rail infrastructure project has announced additional delays, with the new estimated completion date pushed to 2027. Cost overruns now exceed €10 billion, up from the original €4.5 billion budget.

CRITICAL - Include SPECIFIC details:
- Sports: Exact scores, goal scorers with minutes, competition name
- Transportation: Train lines, delay durations, completion dates
- Economic: Company names, percentages, monetary figures
- Events: Dates, venues, performers
- Weather: Temperatures, dates, affected areas
- Political: Official names, policies, voting results

Do NOT use vague language. Include actual facts from search results."""

            response = self._client.models.generate_content(
                model=require_search_model(),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
                ),
            )

            # Extract grounding metadata (titles and URLs)
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response into structured items
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Search completed for {location}: "
                f"{len(news_items)} news items parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,  # Keep raw for frontend fallback
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "location": location,
            }

        except Exception as e:
            logger.error(f"Search failed for {location}: {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

    def search_historical_news(
        self,
        location: str,
        start_year: int,
        end_year: int,
        max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for historical news and events for a specific location and year range.
        Useful for understanding historical context and significant events.

        Args:
            location: City, region, or country to search for
            start_year: Start year of the search range (e.g., 1943)
            end_year: End year of the search range (e.g., 1945)
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for historical news search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Build year range description
            year_range = f"{start_year}" if start_year == end_year else f"{start_year} to {end_year}"

            prompt = f"""Search for the most significant historical news, events, and developments in {location} from {year_range}.

Return EXACTLY {max_items} historical events in this EXACT format:

*   **Category (Month/Year): Headline**
    Detailed paragraph with SPECIFIC historical facts...

Categories must be one of: Political, Military, Economic, Cultural, Scientific, Social

Example format:
*   **Military (June 1944): D-Day Landings Begin Allied Liberation of Europe**
    On June 6, 1944, Allied forces launched Operation Overlord, the largest amphibious invasion in history. Over 156,000 American, British, and Canadian troops landed on five beaches in Normandy, France. The operation marked the beginning of the end for Nazi Germany.

*   **Political (February 1945): Yalta Conference Shapes Post-War Europe**
    Winston Churchill, Franklin D. Roosevelt, and Joseph Stalin met at Yalta in Crimea to discuss the reorganization of Europe after World War II. Key decisions included the division of Germany into occupation zones and the establishment of the United Nations.

CRITICAL - Include SPECIFIC historical details:
- Political: Leaders' names, policies, treaties, election results
- Military: Battle names, dates, casualties, strategic outcomes
- Economic: Trade agreements, industrial developments, financial crises
- Cultural: Artists, movements, significant works, festivals
- Scientific: Discoveries, inventions, researchers, institutions
- Social: Demographics, migrations, social movements, notable figures

Do NOT use vague language. Include actual historical facts about {location} during {year_range}."""

            response = self._client.models.generate_content(
                model=require_search_model(),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
                ),
            )

            # Extract grounding metadata
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Historical news search completed for {location} ({year_range}): "
                f"{len(news_items)} events parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "location": location,
                "start_year": start_year,
                "end_year": end_year,
            }

        except Exception as e:
            logger.error(f"Historical news search failed for {location} ({start_year}-{end_year}): {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

    def search_stakeholder_news(
        self,
        industry: str,
        location: str,
        year: int,
        stakeholder_type: Optional[str] = None,
        max_items: int = 5
    ) -> Dict[str, Any]:
        """
        Search for industry/stakeholder-related news for a specific year.
        Useful for understanding market context and stakeholder concerns.

        Args:
            industry: Industry to search news for (e.g., "FinTech", "Healthcare")
            location: Location/region to focus on (e.g., "Germany", "Berlin")
            year: Year to search news for (e.g., 2024, 2023)
            stakeholder_type: Optional stakeholder type for more targeted search
            max_items: Maximum number of news items to return (default: 5)

        Returns:
            Dict with structured news items and search metadata
        """
        if not self._client:
            logger.warning("Gemini client not available for stakeholder news search")
            return {"news_items": [], "search_performed": False}

        try:
            from google.genai import types

            # Build targeted search query
            stakeholder_context = ""
            if stakeholder_type:
                stakeholder_context = f" Focus on news relevant to {stakeholder_type} stakeholders."

            prompt = f"""Search for the most important {industry} industry news and developments in {location} from the year {year}.{stakeholder_context}

Return EXACTLY {max_items} news items in this EXACT format:

*   **Category (Month {year}): Headline**
    Detailed paragraph with SPECIFIC facts...

Categories must be one of: Industry Trends, Regulatory, Market, Innovation, Investment, Personnel

Example format:
*   **Regulatory (March {year}): New Data Protection Rules Impact FinTech Sector**
    The European Union introduced new regulations affecting how financial technology companies handle customer data. The rules, effective from Q3 {year}, require companies to implement enhanced encryption standards and annual compliance audits.

*   **Investment (June {year}): Major Funding Round for Berlin-based AI Startup**
    TechVenture GmbH secured €50 million in Series B funding, led by Sequoia Capital. The investment will fund expansion into new European markets and development of their enterprise AI platform.

CRITICAL - Include SPECIFIC details:
- Industry Trends: Company names, market share changes, technology shifts
- Regulatory: Law names, effective dates, compliance requirements
- Market: Revenue figures, growth percentages, competitive dynamics
- Innovation: Product launches, technology breakthroughs, patents
- Investment: Funding amounts, investor names, valuations
- Personnel: Executive names, company transitions, organizational changes

Do NOT use vague language. Include actual facts from search results about {industry} in {location} during {year}."""

            response = self._client.models.generate_content(
                model=require_search_model(),
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=[types.Tool(google_search=types.GoogleSearch())],
                    thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
                ),
            )

            # Extract grounding metadata
            search_queries = []
            grounding_sources = []
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                search_queries = list(metadata.web_search_queries or [])
                if metadata.grounding_chunks:
                    for chunk in metadata.grounding_chunks:
                        if hasattr(chunk, 'web') and chunk.web:
                            source_info = {
                                "title": chunk.web.title if hasattr(chunk.web, 'title') else "Unknown",
                                "url": chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            }
                            grounding_sources.append(source_info)

            # Parse markdown response
            raw_text = response.text
            news_items = parse_news_markdown(raw_text)

            logger.info(
                f"Stakeholder news search completed for {industry} in {location} ({year}): "
                f"{len(news_items)} news items parsed from {len(grounding_sources)} sources"
            )

            return {
                "news_items": news_items,
                "raw_response": raw_text,
                "search_queries": search_queries,
                "sources": grounding_sources[:10],
                "search_performed": True,
                "industry": industry,
                "location": location,
                "year": year,
            }

        except Exception as e:
            logger.error(f"Stakeholder news search failed for {industry} in {location} ({year}): {e}")
            return {
                "news_items": [],
                "search_performed": False,
                "error": str(e)
            }

    def search_web_general(
        self,
        query: str,
        *,
        _precomputed_response: tuple[Any, Dict[str, Any]] | None = None,
        _started_at: float | None = None,
        _diagnostic_deadline_seconds: float | None = None,
        _resolved_grounding_redirects: dict[str, str | None] | None = None,
        _normalization_deadline: float | None = None,
    ) -> Dict[str, Any]:
        """
        Perform a general Google search using Gemini's search grounding.
        
        Args:
            query: The search query string.
            
        Returns:
            Dict containing the raw text response, source titles/URLs, and search metadata.
        """
        clock = getattr(self, "_search_clock", time.monotonic)
        started_at = clock() if _started_at is None else _started_at
        if not self._client:
            logger.warning("Gemini client not available for search_web_general")
            return {
                "text": "",
                "sources": [],
                "claims": [],
                "provider": "gemini_google_search",
                "search_performed": False,
                "error": "ClientUnavailable",
                "runtime_diagnostics": self._search_runtime_diagnostics(
                    status="unavailable",
                    started_at=started_at,
                    call_count=0,
                ),
            }

        runtime_diagnostics: Optional[Dict[str, Any]] = None
        try:
            def require_normalization_time() -> None:
                if (
                    _normalization_deadline is not None
                    and clock() >= _normalization_deadline
                ):
                    raise TimeoutError(
                        "Gemini grounded response normalization exceeded its deadline"
                    )

            if _precomputed_response is None:
                response, runtime_diagnostics = self._generate_grounded_content(
                    query
                )
            else:
                response, runtime_diagnostics = _precomputed_response

            require_normalization_time()
            grounding_sources = []
            grounded_claims = []
            raw_text = response.text or ""
            response_hash = hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
            require_normalization_time()
            retrieved_at = datetime.now(timezone.utc).isoformat()
            provider_queries = []
            provider_query_ids = []
            search_entry_point = None
            response_parts = []
            if response.candidates:
                content = getattr(response.candidates[0], "content", None)
                response_parts = [
                    str(getattr(part, "text", None) or "")
                    for part in islice(
                        getattr(content, "parts", None) or [],
                        GEMINI_SEARCH_MAX_RESPONSE_PARTS,
                    )
                ]
            if not response_parts:
                response_parts = [raw_text]
            response_part_hashes = [
                hashlib.sha256(part.encode("utf-8")).hexdigest()
                for part in response_parts
            ]
            response_parts_manifest = hashlib.sha256(
                "\n".join(response_part_hashes).encode("ascii")
            ).hexdigest()
            require_normalization_time()
            if response.candidates and response.candidates[0].grounding_metadata:
                metadata = response.candidates[0].grounding_metadata
                provider_queries = [
                    str(value)[:1000]
                    for value in islice(
                        getattr(metadata, "web_search_queries", None) or [],
                        GEMINI_SEARCH_MAX_PROVIDER_QUERIES,
                    )
                ]
                provider_query_ids = [
                    hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]
                    for value in provider_queries
                ]
                entry = getattr(metadata, "search_entry_point", None)
                rendered = getattr(entry, "rendered_content", None) if entry else None
                if rendered:
                    search_entry_point = {
                        "rendered_content_hash": hashlib.sha256(
                            str(rendered).encode("utf-8")
                        ).hexdigest(),
                        # Google requires Search Suggestions to be displayed as
                        # supplied. Consumers may omit them, but must not mutate.
                        "rendered_content": str(rendered),
                    }
                chunk_url_by_index = {}
                if metadata.grounding_chunks:
                    for chunk_index, chunk in enumerate(
                        islice(
                            metadata.grounding_chunks,
                            GEMINI_SEARCH_MAX_GROUNDING_CHUNKS,
                        )
                    ):
                        require_normalization_time()
                        if hasattr(chunk, 'web') and chunk.web:
                            raw_provider_url = (
                                chunk.web.uri if hasattr(chunk.web, 'uri') else None
                            )
                            raw_provider_url = (
                                str(raw_provider_url) if raw_provider_url else None
                            )
                            provider_url = (
                                raw_provider_url
                                if raw_provider_url
                                and is_canonical_public_https_url(raw_provider_url)
                                else None
                            )
                            if provider_url is None:
                                continue
                            resolved_url = (
                                _resolved_grounding_redirects.get(provider_url)
                                if _resolved_grounding_redirects is not None
                                and _trusted_grounding_redirect(provider_url)
                                else self._resolve_grounding_redirect(provider_url)
                                if _trusted_grounding_redirect(provider_url)
                                else None
                            )
                            url = resolved_url or provider_url
                            source = {
                                "title": (
                                    chunk.web.title
                                    if hasattr(chunk.web, 'title')
                                    else "Unknown"
                                ),
                                "url": url,
                                "provider_url": provider_url,
                                "resolved_url": resolved_url,
                                "provider": "gemini_google_search",
                                "provider_source_id": (
                                    f"gemini-chunk-{response_hash[:16]}-{chunk_index}"
                                ),
                                "grounding_chunk_index": chunk_index,
                                "provider_response_hash": response_hash,
                                "provider_query_ids": provider_query_ids,
                                "provider_queries": provider_queries,
                                "retrieved_at": retrieved_at,
                                "citation_metadata": {
                                    "grounding_chunk_index": chunk_index,
                                    "search_entry_point": search_entry_point,
                                    "provider_url": provider_url,
                                    "resolved_url": resolved_url,
                                },
                                "provider_redirect": bool(
                                    provider_url
                                    and _trusted_grounding_redirect(provider_url)
                                ),
                            }
                            grounding_sources.append(source)
                            chunk_url_by_index[chunk_index] = url

                # Preserve Gemini's claim-to-source relationship instead of
                # treating the whole generated answer as equally grounded.
                for support in islice(
                    getattr(metadata, "grounding_supports", None) or [],
                    GEMINI_SEARCH_MAX_GROUNDING_SUPPORTS,
                ):
                    require_normalization_time()
                    segment = getattr(support, "segment", None)
                    claim_text = getattr(segment, "text", None) if segment else None
                    if not claim_text:
                        continue
                    start_index = getattr(segment, "start_index", None)
                    end_index = getattr(segment, "end_index", None)
                    part_index = getattr(segment, "part_index", None)
                    if not isinstance(part_index, int):
                        part_index = 0 if len(response_parts) == 1 else None
                    part_text = (
                        response_parts[part_index]
                        if isinstance(part_index, int)
                        and 0 <= part_index < len(response_parts)
                        else None
                    )
                    part_bytes = (
                        part_text.encode("utf-8") if isinstance(part_text, str) else b""
                    )
                    try:
                        cited_bytes = part_bytes[start_index:end_index]
                        cited_text = cited_bytes.decode("utf-8")
                    except (TypeError, UnicodeDecodeError):
                        cited_text = None
                    if (
                        not isinstance(start_index, int)
                        or not isinstance(end_index, int)
                        or start_index < 0
                        or end_index <= start_index
                        or not isinstance(part_index, int)
                        or cited_text != str(claim_text)
                    ):
                        logger.warning(
                            "Discarding Gemini grounding support with invalid response span"
                        )
                        continue
                    source_urls = []
                    chunk_indices = list(
                        islice(
                            getattr(
                                support,
                                "grounding_chunk_indices",
                                None,
                            )
                            or [],
                            GEMINI_SEARCH_MAX_GROUNDING_CHUNKS,
                        )
                    )
                    for index in chunk_indices:
                        if not isinstance(index, int):
                            continue
                        source_url = chunk_url_by_index.get(index)
                        if source_url:
                            source_urls.append(source_url)
                    if not source_urls:
                        continue
                    grounded_claims.append({
                        "text": str(claim_text),
                        "source_urls": list(dict.fromkeys(source_urls)),
                        "provider": "gemini_google_search",
                        "provider_response_hash": response_hash,
                        "provider_query_ids": provider_query_ids,
                        "provider_queries": provider_queries,
                        "grounding_chunk_indices": chunk_indices,
                        "segment_start": start_index,
                        "segment_end": end_index,
                        "part_index": part_index,
                        "offset_unit": "utf8_bytes",
                        "span_target": "provider_response_part",
                        "provenance_artifact": {
                            "artifact_type": "provider_response_part",
                            "part_index": part_index,
                            "text": part_text,
                            "sha256": hashlib.sha256(part_bytes).hexdigest(),
                            "response_parts_sha256": response_parts_manifest,
                            "response_part_hashes": response_part_hashes,
                            # Retain the exact bounded provider response so a
                            # consumer can prove this part belongs to the
                            # hashed response, rather than trusting a
                            # caller-supplied part/hash pair.
                            "response_parts": response_parts,
                            "provider_response_text": raw_text,
                            "provider_response_sha256": response_hash,
                        },
                        "confidence_scores": list(
                            islice(
                                getattr(support, "confidence_scores", None) or [],
                                10,
                            )
                        ),
                    })

            require_normalization_time()
            # A generated answer is not a grounded-search result merely because
            # the Google Search tool was enabled. Gemini can return ordinary
            # model prose without any grounding metadata, or chunks without a
            # support that binds an exact response span to a source. Treat only
            # a verified claim/source pair as successful grounded research.
            has_grounded_evidence = bool(grounding_sources and grounded_claims)
            grounding_status = (
                "ok" if has_grounded_evidence else "response_processing_error"
            )
            prior_call_count = int(runtime_diagnostics.get("call_count", 0))
            prior_model = str(runtime_diagnostics.get("model") or RESEARCH_MODEL)
            runtime_diagnostics = self._search_runtime_diagnostics(
                status=grounding_status,
                started_at=started_at,
                call_count=prior_call_count,
                model=prior_model,
                deadline_seconds=_diagnostic_deadline_seconds,
            )
            result = {
                "text": raw_text if has_grounded_evidence else "",
                "sources": grounding_sources[:10] if has_grounded_evidence else [],
                "claims": grounded_claims[:50] if has_grounded_evidence else [],
                "provider": "gemini_google_search",
                "provider_response_hash": response_hash,
                "provider_query_ids": provider_query_ids,
                "provider_queries": provider_queries,
                "search_entry_point": search_entry_point,
                "search_performed": has_grounded_evidence,
                "usage_metadata": _normalized_usage_metadata(response),
                "runtime_diagnostics": runtime_diagnostics,
            }
            if not has_grounded_evidence:
                result["error"] = "MissingGroundingEvidence"
            model_version = _provider_model_version(response)
            if model_version is not None:
                result["model_version"] = model_version
            if has_grounded_evidence:
                logger.info(
                    "Gemini grounded search completed; route=%s model=%s "
                    "status=%s elapsed_ms=%s call_count=%s",
                    runtime_diagnostics["route"],
                    runtime_diagnostics["model"],
                    runtime_diagnostics["status"],
                    runtime_diagnostics["elapsed_ms"],
                    runtime_diagnostics["call_count"],
                )
            else:
                logger.warning(
                    "Gemini grounded search returned no source-backed claim; "
                    "route=%s model=%s status=%s elapsed_ms=%s call_count=%s",
                    runtime_diagnostics["route"],
                    runtime_diagnostics["model"],
                    runtime_diagnostics["status"],
                    runtime_diagnostics["elapsed_ms"],
                    runtime_diagnostics["call_count"],
                )
            return result
        except Exception as e:
            if isinstance(e, _GroundedSearchRuntimeError):
                runtime_diagnostics = e.diagnostics
                root_error = e.cause
            else:
                root_error = e
                prior_calls = (
                    runtime_diagnostics.get("call_count", 0)
                    if runtime_diagnostics
                    else 0
                )
                runtime_diagnostics = self._search_runtime_diagnostics(
                    status="response_processing_error",
                    started_at=started_at,
                    call_count=prior_calls,
                    deadline_seconds=_diagnostic_deadline_seconds,
                )
            _log_grounded_search_failure(runtime_diagnostics, root_error)
            return {
                "text": "",
                "sources": [],
                "claims": [],
                "provider": "gemini_google_search",
                "search_performed": False,
                "error": type(root_error).__name__,
                "runtime_diagnostics": runtime_diagnostics,
            }

    async def search_web_general_async(self, query: str) -> Dict[str, Any]:
        """Perform cancellable Gemini-grounded search for async workflows."""

        clock = getattr(self, "_search_clock", time.monotonic)
        started_at = clock()
        if not self._client:
            logger.warning("Gemini client not available for search_web_general_async")
            return {
                "text": "",
                "sources": [],
                "claims": [],
                "provider": "gemini_google_search",
                "search_performed": False,
                "error": "ClientUnavailable",
                "runtime_diagnostics": self._search_runtime_diagnostics(
                    status="unavailable",
                    started_at=started_at,
                    call_count=0,
                ),
            }

        try:
            response_and_diagnostics = await self._generate_grounded_content_async(
                query
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if isinstance(error, _GroundedSearchRuntimeError):
                runtime_diagnostics = error.diagnostics
                root_error = error.cause
            else:
                root_error = error
                runtime_diagnostics = self._search_runtime_diagnostics(
                    status="response_processing_error",
                    started_at=started_at,
                    call_count=0,
                )
            _log_grounded_search_failure(runtime_diagnostics, root_error)
            return _with_response_metering({
                "text": "",
                "sources": [],
                "claims": [],
                "provider": "gemini_google_search",
                "search_performed": False,
                "error": type(root_error).__name__,
                "runtime_diagnostics": runtime_diagnostics,
            }, getattr(error, "response_metering", None))

        _response, diagnostics = response_and_diagnostics
        if "_parsed_result" in diagnostics:
            return _with_response_metering(
                diagnostics["_parsed_result"], diagnostics.get("_response_metering")
            )
        result = await self._normalize_grounded_result_async(
            query, response_and_diagnostics, started_at=started_at,
        )
        return _with_response_metering(result, diagnostics.get("_response_metering"))

    async def _normalize_grounded_result_async(
        self,
        query: str,
        response_and_diagnostics: tuple[Any, Dict[str, Any]],
        *,
        started_at: float,
        absolute_deadline: float | None = None,
        wall_clock_deadline: float | None = None,
    ) -> Dict[str, Any]:
        """Normalize exactly once; publication checks share the original deadline."""
        clock = getattr(self, "_search_clock", time.monotonic)
        # Resolve at most ten redirect hops concurrently under one strict,
        # cancellable aggregate deadline. The subsequent parser is CPU-only and
        # bounded to ten chunks/fifty supports; it must never start sync network
        # work on the workflow path.
        provider_seconds = float(
            getattr(
                self,
                "_search_operation_seconds",
                GEMINI_SEARCH_OPERATION_SECONDS,
            )
        )
        redirect_seconds = float(
            getattr(
                self,
                "_search_redirect_seconds",
                GEMINI_SEARCH_REDIRECT_PHASE_SECONDS,
            )
        )
        parse_seconds = float(
            getattr(
                self,
                "_search_parse_seconds",
                GEMINI_SEARCH_PARSE_SECONDS,
            )
        )
        response, _runtime_diagnostics = response_and_diagnostics
        redirects = self._grounding_redirect_urls(response)
        loop = asyncio.get_running_loop()

        def remaining() -> float:
            return min(
                absolute_deadline - clock() if absolute_deadline is not None else math.inf,
                wall_clock_deadline - loop.time() if wall_clock_deadline is not None else math.inf,
            )

        if remaining() <= 0:
            raise TimeoutError("Grounded publication deadline exceeded")
        redirect_budget = min(redirect_seconds, remaining())
        async with asyncio.timeout_at(wall_clock_deadline):
            resolved_redirects = await self._resolve_grounding_redirects_async(
                redirects, timeout_seconds=redirect_budget,
            )
        if remaining() <= 0:
            raise TimeoutError("Grounded publication deadline exceeded")
        parse_started_at = clock()
        result = self.search_web_general(
            query,
            _precomputed_response=response_and_diagnostics,
            _started_at=started_at,
            _diagnostic_deadline_seconds=(
                provider_seconds + redirect_seconds + parse_seconds
            ),
            _resolved_grounding_redirects=resolved_redirects,
            _normalization_deadline=parse_started_at + min(parse_seconds, remaining()),
        )
        if remaining() <= 0:
            raise TimeoutError("Grounded publication deadline exceeded")
        return result
