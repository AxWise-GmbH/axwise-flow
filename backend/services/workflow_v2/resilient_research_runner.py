"""Bounded provider-independent fallback for workflow-v2 research acquisition.

Gemini Search remains the primary acquisition route.  This adapter invokes
SearXNG only after a retryable grounded-search failure and treats every SearXNG
result as discovery metadata, never as verified evidence.  A claim is emitted
only when it is a unique, byte-exact span of one independently fetched final
publisher document.
"""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import logging
import math
import re
import time
from bisect import bisect_left, bisect_right
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Mapping, Protocol
from urllib.parse import urlsplit

import httpx

from backend.domain.workflow_v2.contracts import (
    canonical_json,
    is_canonical_public_https_url,
)
from backend.services.generative.searxng_search_service import SearxngSearchService
from backend.services.workflow_v2.direct_source_fetch import canonical_public_url
from backend.services.workflow_v2.exact_span_extractor import (
    MAX_DOCUMENT_CODE_POINTS,
    BoundedFetchedDocument,
    ExactSpanExtractionRequest,
    ExactSpanExtractionResult,
    ExactSpanRequirementQuery,
)
from backend.services.workflow_v2.research_diagnostics import (
    plain_diagnostic_fields,
    sanitize_research_evidence_diagnostics,
)
from backend.services.workflow_v2.research_query_budgets import (
    FALLBACK_DISCOVERY_TOPIC_CHARACTERS,
)

logger = logging.getLogger(__name__)


_FALLBACK_PRIMARY_STATUSES = frozenset(
    {
        "deadline_exceeded",
        "retry_exhausted",
        "unavailable",
        "response_processing_error",
        "grounding_evidence_missing",
        "quality_rejected",
    }
)
_HEALTHY_DISCOVERY_STATUSES = frozenset({"ok", "empty"})
_CONFIGURED_DISCOVERY_ENGINES = frozenset({"bing", "brave", "duckduckgo", "google"})
# Keep the exact-span model input compact enough to finish inside the existing
# fallback extraction deadline. The fetcher still hashes the complete publisher
# document; only the deterministic, relevance-ranked extraction window is bounded.
_MAX_DOCUMENT_CHARACTERS = 40_000
_MAX_DISCOVERY_QUERY_CHARACTERS = 2_000
_MAX_DIAGNOSTIC_CALLS = 100
_MAX_DIAGNOSTIC_ELAPSED_MS = 900_000
_MAX_REUSABLE_SOURCE_CANDIDATES = 3
_MAX_LOCATOR_WINDOW_GRID_CANDIDATES = 256
_DEFAULT_PRIMARY_COOLDOWN_SECONDS = 450.0
_MAX_PRIMARY_COOLDOWN_SECONDS = 900.0
_DEFAULT_PRIMARY_HEALTHY_SECONDS = 5.0
_MAX_PRIMARY_HEALTHY_SECONDS = 30.0
WORKFLOW_V2_FALLBACK_PHASE_SECONDS = 60.0
_FALLBACK_DISCOVERY_SECONDS = 10.0
# Assistant may match the discovery adapter's request allowance, including its
# private-service authentication, without changing durable research's defaults.
_MAX_FALLBACK_DISCOVERY_SECONDS = 20.0
_FALLBACK_FETCH_SECONDS = 25.0
_FALLBACK_EXTRACTION_SECONDS = 25.0
_DISCOVERY_SECTION_BUDGETS = {
    "requirement": 560,
    "applicability": 300,
    "source classes": 160,
    "publishers": 650,
    "topics": FALLBACK_DISCOVERY_TOPIC_CHARACTERS,
    "geography": 80,
}
_LOCATOR_STOP_WORDS = frozenset(
    {
        "about",
        "after",
        "against",
        "applicable",
        "before",
        "between",
        "creating",
        "during",
        "every",
        "exact",
        "their",
        "these",
        "those",
        "through",
        "under",
        "using",
        "verify",
        "when",
        "where",
        "which",
        "while",
        "with",
    }
)
_HTTPS_LOCATOR_IN_TEXT = re.compile(r"https://[^\s<>{}\[\]\"'`]+")
_HTTPS_LOCATOR_TRAILING_PUNCTUATION = ".,;:!?)]}"


@dataclass(frozen=True)
class DirectDocumentSnapshot:
    canonical_url: str
    title: str
    text: str
    content_sha256: str
    retrieved_at: str


class ResearchRunner(Protocol):
    async def search(self, query: str) -> dict[str, Any]: ...


class DirectDocumentExtractor(Protocol):
    async def extract(
        self, request: ExactSpanExtractionRequest
    ) -> ExactSpanExtractionResult: ...


DirectTextFetcher = Callable[[str], Awaitable[Mapping[str, Any]]]
SourceTypeClassifier = Callable[[str, str], set[str]]


def _fetch_failure_category(error: Exception) -> str:
    """Classify failures without emitting exception text, URLs, or response bodies."""

    if isinstance(error, (TimeoutError, httpx.TimeoutException)):
        return "timeout"
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        return (
            "http_4xx"
            if 400 <= status < 500
            else "http_5xx" if 500 <= status < 600 else "http_status"
        )
    if isinstance(error, httpx.TransportError):
        return "transport"
    if isinstance(error, ValueError) and len(error.args) == 1:
        # Only exact constant messages from the owned direct-source fetcher are
        # inspected. Unknown messages (including user-controlled content) collapse.
        reason = error.args[0]
        if isinstance(reason, str):
            return {
                "unsafe direct source URL": "security_rejected",
                "unsafe direct source host": "security_rejected",
                "unsafe direct source address": "security_rejected",
                "unsafe direct source connection peer": "security_rejected",
                "unsafe direct source redirect": "security_rejected",
                "direct source final URL is unsafe": "security_rejected",
                "direct source encoded responses are disabled": "encoded_response",
                "direct source is not textual": "unsupported_content_type",
                "direct source contains no text": "empty_document",
                "direct source returned an access challenge": "access_challenge",
                "direct source exceeds size limit": "size_limit",
                "direct source has invalid content length": "invalid_content_length",
                "direct source redirect omitted location": "invalid_redirect",
                "direct source exceeded redirect limit": "redirect_limit",
            }.get(reason, "other")
    return "other"


@dataclass(frozen=True)
class _FallbackContext:
    discovery_query: str
    query_complete: bool
    requirement: dict[str, Any]
    applies_when: str
    accepted_source_types: tuple[str, ...]
    allowed_hosts: frozenset[str]
    reusable_candidates: tuple[_Candidate, ...]
    authority_candidates: tuple[_Candidate, ...]


@dataclass(frozen=True)
class _Candidate:
    canonical_url: str
    title: str
    snippets: tuple[str, ...]


@dataclass(frozen=True)
class _VerifiedSpan:
    text: str
    segment_start: int
    segment_end: int


async def _await_cancellation_safe(cleanup: Awaitable[None]) -> None:
    """Finish one invariant-restoring cleanup while retaining cancellation."""

    cleanup_task = asyncio.ensure_future(cleanup)
    cancellation: asyncio.CancelledError | None = None
    while True:
        try:
            await asyncio.shield(cleanup_task)
            break
        except asyncio.CancelledError as error:
            if cleanup_task.cancelled():
                raise
            cancellation = error
    if cancellation is not None:
        raise cancellation


async def _default_fetch_direct_text(
    url: str, *, url_validator: Callable[[str], bool] | None = None
) -> Mapping[str, Any]:
    # Kept lazy so importing the runner does not pull the legacy authority
    # stack into the small workflow-v2 worker image.
    from backend.services.workflow_v2.direct_source_fetch import fetch_direct_source

    return await fetch_direct_source(url, **(
        {"url_validator": url_validator} if url_validator is not None else {}
    ))


def _normalized_text(value: Any, *, maximum: int) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = re.sub(r"\s+", " ", value).strip()
    if not normalized:
        return None
    return normalized[:maximum]


def _utf16_key(value: str) -> bytes:
    return value.encode("utf-16-be")


def _ordered_unique(values: list[str]) -> list[str]:
    return sorted(set(values), key=_utf16_key)


def _bounded_query_term(value: str, *, maximum: int) -> tuple[str, bool]:
    """Render one natural search term without letting it consume later fields."""

    if maximum <= 1:
        raise ValueError("discovery term budget is too small")
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= maximum:
        return normalized, True
    return normalized[: maximum - 1].rstrip() + "\u2026", False


def _finite_diagnostic_int(
    diagnostics: Mapping[str, Any],
    *keys: str,
    maximum: int,
) -> int:
    for key in keys:
        if key not in diagnostics:
            continue
        try:
            return min(maximum, max(0, int(diagnostics[key])))
        except (TypeError, ValueError, OverflowError):
            return 0
    return 0


def _finite_phase_diagnostics(
    diagnostics: Mapping[str, Any], *, route: str, status: str
) -> dict[str, Any]:
    """Copy only finite, content-free fields across the provider boundary."""

    result = {
        "route": route,
        "status": status,
        "elapsed_ms": _finite_diagnostic_int(
            diagnostics,
            "elapsed_ms",
            "elapsedMs",
            maximum=_MAX_DIAGNOSTIC_ELAPSED_MS,
        ),
        "call_count": _finite_diagnostic_int(
            diagnostics,
            "call_count",
            "callCount",
            maximum=_MAX_DIAGNOSTIC_CALLS,
        ),
        "retry_count": _finite_diagnostic_int(
            diagnostics,
            "retry_count",
            "retryCount",
            maximum=_MAX_DIAGNOSTIC_CALLS,
        ),
    }
    if diagnostics.get("primary_skipped") is True:
        result["primary_skipped"] = True
        result["circuit_state"] = "open"
    retry_after_seconds = _finite_diagnostic_int(
        diagnostics,
        "retry_after_seconds",
        "retryAfterSeconds",
        maximum=int(_MAX_PRIMARY_COOLDOWN_SECONDS),
    )
    if retry_after_seconds >= 1:
        result["retry_after_seconds"] = retry_after_seconds
    upstream_status_code = diagnostics.get("upstream_status_code")
    if type(upstream_status_code) is int and 100 <= upstream_status_code <= 599:
        result["upstream_status_code"] = upstream_status_code
    return result


def _finite_elapsed_ms(started_at: float, completed_at: float) -> int:
    try:
        elapsed = round((completed_at - started_at) * 1000)
    except (TypeError, ValueError, OverflowError):
        return 0
    if not math.isfinite(elapsed):
        return 0
    return min(_MAX_DIAGNOSTIC_ELAPSED_MS, max(0, int(elapsed)))


def _with_fallback_elapsed(
    result: dict[str, Any], *, elapsed_ms: int
) -> dict[str, Any]:
    diagnostics = result.get("runtime_diagnostics")
    if not isinstance(diagnostics, dict):
        return result
    if diagnostics.get("route") == "searxng_direct_fetch":
        primary = diagnostics.get("primary")
        primary_elapsed_ms = (
            _finite_diagnostic_int(
                primary,
                "elapsed_ms",
                maximum=_MAX_DIAGNOSTIC_ELAPSED_MS,
            )
            if isinstance(primary, Mapping)
            else 0
        )
        diagnostics["fallback_elapsed_ms"] = elapsed_ms
        diagnostics["elapsed_ms"] = min(
            _MAX_DIAGNOSTIC_ELAPSED_MS,
            primary_elapsed_ms + elapsed_ms,
        )
        return result
    fallback = diagnostics.get("fallback")
    if isinstance(fallback, dict):
        fallback["elapsed_ms"] = elapsed_ms
        primary_elapsed_ms = _finite_diagnostic_int(
            diagnostics,
            "elapsed_ms",
            maximum=_MAX_DIAGNOSTIC_ELAPSED_MS,
        )
        diagnostics["elapsed_ms"] = min(
            _MAX_DIAGNOSTIC_ELAPSED_MS,
            primary_elapsed_ms + elapsed_ms,
        )
    return result


def _usage_metadata(input_tokens: int, output_tokens: int) -> dict[str, int]:
    return {
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "totalTokens": input_tokens + output_tokens,
    }


def _optional_usage_int(source: Any, *keys: str) -> int | None:
    if not isinstance(source, Mapping):
        return None
    for key in keys:
        if key not in source:
            continue
        try:
            return max(0, int(source[key]))
        except (TypeError, ValueError, OverflowError):
            return None
    return None


def _primary_usage(primary: Mapping[str, Any]) -> tuple[int, int]:
    """Normalize the already-incurred Gemini usage without estimating it."""

    usage = primary.get("usage_metadata")
    normalized_input = _optional_usage_int(usage, "input_tokens", "inputTokens")
    input_tokens = (
        normalized_input
        if normalized_input is not None
        else (_optional_usage_int(usage, "prompt_token_count", "promptTokenCount") or 0)
        + (
            _optional_usage_int(
                usage,
                "tool_use_prompt_token_count",
                "toolUsePromptTokenCount",
            )
            or 0
        )
    )
    normalized_output = _optional_usage_int(usage, "output_tokens", "outputTokens")
    output_tokens = (
        normalized_output
        if normalized_output is not None
        else (
            _optional_usage_int(
                usage,
                "candidates_token_count",
                "candidatesTokenCount",
            )
            or 0
        )
        + (
            _optional_usage_int(usage, "thoughts_token_count", "thoughtsTokenCount")
            or 0
        )
    )
    reported_total = _optional_usage_int(
        usage,
        "total_tokens",
        "totalTokens",
        "total_token_count",
        "totalTokenCount",
    )
    if reported_total is not None:
        output_tokens = max(output_tokens, max(0, reported_total - input_tokens))
    return input_tokens, output_tokens


def _combined_usage_metadata(
    primary: Mapping[str, Any],
    *,
    extractor_input_tokens: int = 0,
    extractor_output_tokens: int = 0,
) -> dict[str, Any]:
    primary_input_tokens, primary_output_tokens = _primary_usage(primary)
    result = _usage_metadata(
        primary_input_tokens + max(0, extractor_input_tokens),
        primary_output_tokens + max(0, extractor_output_tokens),
    )
    primary_usage = primary.get("usage_metadata")
    if isinstance(primary_usage, Mapping):
        if "search_calls" in primary_usage:
            count = primary_usage["search_calls"]
            result["search_calls"] = count if type(count) is int and count >= 0 else None
        if primary_usage.get("usage_complete") is False:
            result.update(
                input_tokens=None, output_tokens=None, total_tokens=None,
                inputTokens=None, outputTokens=None, totalTokens=None,
                usage_complete=False,
            )
        elif primary_usage.get("usage_complete") is True:
            result["usage_complete"] = True
    return result


def _primary_provider_queries(primary: Mapping[str, Any]) -> list[str]:
    """Carry only actual Gemini Search queries; SearX discovery is never counted."""

    raw = primary.get("provider_queries")
    if not isinstance(raw, list):
        return []
    return [value for value in raw if isinstance(value, str)]


def _with_uniform_model_version(
    result: dict[str, Any], *values: Any
) -> dict[str, Any]:
    """Expose one exact served version only when every observed value agrees."""

    normalized: list[str] = []
    for value in values:
        if not isinstance(value, str):
            result.pop("model_version", None)
            return result
        candidate = value.strip()
        if not candidate or len(candidate) > 200:
            result.pop("model_version", None)
            return result
        normalized.append(candidate)
    if normalized and len(set(normalized)) == 1:
        result["model_version"] = normalized[0]
    else:
        result.pop("model_version", None)
    return result


def _apply_primary_metering(
    result: dict[str, Any],
    primary: Mapping[str, Any],
    *,
    extractor_input_tokens: int = 0,
    extractor_output_tokens: int = 0,
) -> dict[str, Any]:
    result["usage_metadata"] = _combined_usage_metadata(
        primary,
        extractor_input_tokens=extractor_input_tokens,
        extractor_output_tokens=extractor_output_tokens,
    )
    # The shared cognitive metrics contract counts this exact list. Never append
    # the SearX discovery query or the plain-Gemini extraction request to it.
    result.pop("provider_queries", None)
    provider_queries = _primary_provider_queries(primary)
    if provider_queries:
        result["provider_queries"] = provider_queries
    return _with_uniform_model_version(result, primary.get("model_version"))


def _finite_status(value: Any, *, default: str = "error") -> str:
    normalized = str(value or "")
    return normalized if re.fullmatch(r"[A-Za-z0-9_:-]{1,100}", normalized) else default


def _fallback_runtime_diagnostics(
    *,
    status: str,
    primary_status: str,
    primary_diagnostics: Mapping[str, Any],
    discovery_diagnostics: Mapping[str, Any],
    candidate_count: int,
    fetched_count: int,
    query_complete: bool,
    validation_incomplete_count: int,
    rejected_candidate_count: int,
    malformed_candidate_count: int,
    omitted_candidate_count: int,
    claim_count: int,
    usage_input_tokens: int,
    usage_output_tokens: int,
    primary_provider_query_count: int,
) -> dict[str, Any]:
    primary_summary = _finite_phase_diagnostics(
        primary_diagnostics,
        route="gemini_google_search",
        status=primary_status,
    )
    actual_discovery_status = _finite_status(
        discovery_diagnostics.get("status"),
        default=(status if status in _HEALTHY_DISCOVERY_STATUSES else "unavailable"),
    )
    discovery_summary = _finite_phase_diagnostics(
        discovery_diagnostics,
        route="searxng",
        status=actual_discovery_status,
    )
    return {
        "route": "searxng_direct_fetch",
        "status": status,
        "primary_status": primary_status,
        "fallback_attempted": True,
        "fallback_used": True,
        # The runner replaces this placeholder with measured fallback wall
        # time after discovery, fetch and extraction have all terminated.
        "elapsed_ms": 0,
        "call_count": min(
            _MAX_DIAGNOSTIC_CALLS,
            primary_summary["call_count"] + discovery_summary["call_count"],
        ),
        "retry_count": min(
            _MAX_DIAGNOSTIC_CALLS,
            primary_summary["retry_count"] + discovery_summary["retry_count"],
        ),
        "primary": primary_summary,
        "discovery": discovery_summary,
        "extractor": {
            "input_tokens": usage_input_tokens,
            "output_tokens": usage_output_tokens,
        },
        "primary_provider_query_count": primary_provider_query_count,
        "query_complete": query_complete,
        "candidate_count": candidate_count,
        "fetched_count": fetched_count,
        "validation_incomplete_count": validation_incomplete_count,
        "rejected_candidate_count": rejected_candidate_count,
        "malformed_candidate_count": malformed_candidate_count,
        "omitted_candidate_count": omitted_candidate_count,
        "claim_count": claim_count,
    }


def _canonical_candidate_url(value: Any) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 4_000:
        return None
    return canonical_public_url(value.strip())


def _url_matches_allowed_hosts(url: str, allowed_hosts: frozenset[str]) -> bool:
    if not allowed_hosts:
        return True
    try:
        host = (urlsplit(url).hostname or "").casefold()
    except ValueError:
        return False
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in allowed_hosts)


_EU_REGULATION_NUMBER_YEAR = re.compile(
    r"\bRegulation\s*\((?:EC|EU|EEC)\)\s+No\.?\s*"
    r"(?P<number>[1-9]\d{0,5})\s*/\s*(?P<year>(?:19|20)\d{2})\b",
    re.IGNORECASE,
)
_EU_REGULATION_YEAR_NUMBER = re.compile(
    r"\bRegulation\s*\(EU\)\s*"
    r"(?P<year>(?:19|20)\d{2})\s*/\s*(?P<number>[1-9]\d{0,5})\b",
    re.IGNORECASE,
)


def _explicit_eu_regulation_candidates(
    requirement: Mapping[str, Any],
    *,
    allowed_hosts: frozenset[str],
) -> tuple[_Candidate, ...] | None:
    """Resolve only explicit accepted EU regulation references to EUR-Lex.

    Search results remain useful discovery locators, but a degraded public
    search engine must not hide a primary-law document that the accepted
    requirement already identifies exactly. ELI is the EU's canonical,
    deterministic identifier scheme; the publisher page is still refetched
    and must pass the same exact-span validation as every other candidate.
    """

    accepted_source_types = requirement.get("acceptedSourceTypes")
    description = requirement.get("description")
    if (
        requirement.get("evidenceRole") != "grounded_claim"
        or requirement.get("verificationBasis") != "grounded_claims"
        or not isinstance(accepted_source_types, list)
        or "primary_law" not in accepted_source_types
        or not isinstance(description, str)
    ):
        return ()
    authority_host = "eur-lex.europa.eu"
    if allowed_hosts and not _url_matches_allowed_hosts(
        f"https://{authority_host}", allowed_hosts
    ):
        return ()

    references: list[tuple[int, int, str]] = []
    for pattern in (_EU_REGULATION_NUMBER_YEAR, _EU_REGULATION_YEAR_NUMBER):
        for match in pattern.finditer(description):
            references.append(
                (
                    match.start(),
                    int(match.group("year")),
                    str(int(match.group("number"))),
                )
            )
    references.sort(key=lambda item: item[0])

    candidates: list[_Candidate] = []
    seen_urls: set[str] = set()
    for _offset, year, number in references:
        url = canonical_public_url(
            f"https://{authority_host}/eli/reg/{year}/{number}/oj/eng"
        )
        if url is None or url in seen_urls:
            continue
        seen_urls.add(url)
        candidates.append(
            _Candidate(
                canonical_url=url,
                title=f"EU Regulation {number}/{year} — EUR-Lex",
                snippets=(f"Regulation {number}/{year}",),
            )
        )
        if len(candidates) > 1:
            # One evidence requirement must remain independently verifiable.
            # The current exact-span contract selects one publisher document,
            # so accepting one of several named laws would overstate coverage.
            return None
    return tuple(candidates)


def _canonical_string_list(
    value: Any, *, maximum_items: int, maximum_item_characters: int
) -> tuple[list[str], bool] | None:
    if not isinstance(value, list) or len(value) > maximum_items:
        return None
    normalized: list[str] = []
    complete = True
    for item in value:
        if not isinstance(item, str):
            return None
        full_text = re.sub(r"\s+", " ", item).strip()
        if not full_text:
            return None
        if len(full_text) > maximum_item_characters:
            complete = False
        normalized.append(full_text[:maximum_item_characters])
    return _ordered_unique(normalized), complete


def _fallback_context(server_query: str) -> _FallbackContext | None:
    """Parse only the server-owned canonical payload appended to the prompt."""

    try:
        _instruction, raw_payload = server_query.rsplit("\n", 1)
        payload = json.loads(raw_payload)
    except (AttributeError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(payload, dict):
        return None
    try:
        if canonical_json(payload) != raw_payload:
            return None
    except (TypeError, UnicodeError):
        return None
    semantics = payload.get("acceptedScopeSemantics")
    requirement = payload.get("requirement")
    if not isinstance(semantics, dict) or not isinstance(requirement, dict):
        return None

    raw_anchors = semantics.get("topicAnchors")
    if not isinstance(raw_anchors, list) or len(raw_anchors) > 24:
        return None
    anchors: list[str] = []
    input_complete = True
    for anchor in raw_anchors:
        if not isinstance(anchor, dict):
            return None
        raw_value = anchor.get("value")
        if not isinstance(raw_value, str):
            return None
        full_value = re.sub(r"\s+", " ", raw_value).strip()
        if not full_value:
            return None
        if len(full_value) > 300:
            input_complete = False
        anchors.append(full_value[:300])
    if not anchors:
        return None
    anchors = _ordered_unique(anchors)

    geography_result = _canonical_string_list(
        semantics.get("geography", []),
        maximum_items=24,
        maximum_item_characters=160,
    )
    source_types_result = _canonical_string_list(
        requirement.get("acceptedSourceTypes"),
        maximum_items=7,
        maximum_item_characters=80,
    )
    allowed_hosts_result = _canonical_string_list(
        requirement.get("allowedSourceHosts", []),
        maximum_items=20,
        maximum_item_characters=120,
    )
    raw_description = requirement.get("description")
    raw_applies_when = requirement.get("appliesWhen")
    if (
        not isinstance(raw_description, str)
        or len(raw_description) > 1_000
        or not isinstance(raw_applies_when, str)
        or len(raw_applies_when) > 1_000
    ):
        return None
    description = _normalized_text(raw_description, maximum=1_000)
    applies_when_query = _normalized_text(raw_applies_when, maximum=1_000)
    if (
        geography_result is None
        or source_types_result is None
        or not source_types_result[0]
        or allowed_hosts_result is None
    ):
        return None
    if description is None or applies_when_query is None:
        return None
    geography, geography_complete = geography_result
    source_types, source_types_complete = source_types_result
    allowed_hosts, allowed_hosts_complete = allowed_hosts_result
    input_complete = (
        input_complete
        and geography_complete
        and source_types_complete
        and allowed_hosts_complete
    )
    if any(
        host != host.casefold()
        or not is_canonical_public_https_url(f"https://{host}")
        for host in allowed_hosts
    ):
        return None
    raw_reusable_candidates = payload.get("fallbackCandidateSources", [])
    if (
        not isinstance(raw_reusable_candidates, list)
        or len(raw_reusable_candidates) > _MAX_REUSABLE_SOURCE_CANDIDATES
    ):
        return None
    reusable_candidates, reusable_rejected, reusable_malformed, reusable_omitted = (
        _reusable_candidate_rows(
            raw_reusable_candidates,
            allowed_hosts=frozenset(allowed_hosts),
            maximum=_MAX_REUSABLE_SOURCE_CANDIDATES,
        )
    )
    if reusable_rejected or reusable_malformed or reusable_omitted:
        return None
    authority_candidates = _explicit_eu_regulation_candidates(
        requirement,
        allowed_hosts=frozenset(allowed_hosts),
    )
    if authority_candidates is None:
        return None

    # Each original section keeps its independent completeness check. Query
    # rendering is a discovery hint, never a substitute for source admission or
    # the complete requirement retained for extraction below.
    publisher_sections = []
    if allowed_hosts:
        publisher_sections.append(
            _bounded_query_term(
                " ".join(f"site:{host}" for host in allowed_hosts),
                maximum=_DISCOVERY_SECTION_BUDGETS["publishers"],
            )
        )
    description_section = _bounded_query_term(
        description, maximum=_DISCOVERY_SECTION_BUDGETS["requirement"]
    )
    applicability_section = _bounded_query_term(
        applies_when_query, maximum=_DISCOVERY_SECTION_BUDGETS["applicability"]
    )
    topics_section = _bounded_query_term(
        " ".join(anchors), maximum=_DISCOVERY_SECTION_BUDGETS["topics"]
    )
    geography_sections = []
    if geography:
        geography_sections.append(
            _bounded_query_term(
                " ".join(geography),
                maximum=_DISCOVERY_SECTION_BUDGETS["geography"],
            )
        )
    original_sections = [
        *publisher_sections, description_section, applicability_section,
        topics_section, *geography_sections,
    ]
    query_complete = input_complete and all(
        complete for _section, complete in original_sections
    )
    rendered_sections = original_sections
    if (
        requirement.get("id") == "assistant-one-shot"
        and requirement.get("claimType") == "assistant_one_shot"
    ):
        # The Assistant profile uses a prefix of its own request as an anchor
        # and a fixed orchestration sentence as applicability. Neither adds a
        # search concept. Remove only exact redundancy, with no summarization,
        # stop-word policy, extra query, or change to canonical authority. An
        # anchor in a truncated-away tail is not redundant in the actual query.
        independent_anchors = [
            anchor for anchor in anchors if anchor not in description_section[0]
        ]
        rendered_sections = [*publisher_sections, description_section]
        if applies_when_query != "Answering the current bounded one-shot Assistant request.":
            rendered_sections.append(applicability_section)
        if independent_anchors:
            rendered_sections.append(_bounded_query_term(
                " ".join(independent_anchors),
                maximum=_DISCOVERY_SECTION_BUDGETS["topics"],
            ))
        rendered_sections.extend(geography_sections)
    # Search engines interpret field-like prefixes such as ``requirement:`` as
    # query operators or generic dictionary terms. Keep the server-owned
    # structure in the canonical payload, but send discovery a natural query.
    # Source classes remain an enforcement filter after fetch; words such as
    # ``primary_law`` are not useful public-search terms.
    discovery_query = " ".join(term for term, _complete in rendered_sections)
    if len(discovery_query) > _MAX_DISCOVERY_QUERY_CHARACTERS:
        raise AssertionError("discovery section budgets exceed the query bound")
    return _FallbackContext(
        discovery_query=discovery_query,
        query_complete=query_complete,
        requirement=dict(requirement),
        applies_when=raw_applies_when,
        accepted_source_types=tuple(source_types),
        allowed_hosts=frozenset(allowed_hosts),
        reusable_candidates=tuple(reusable_candidates),
        authority_candidates=authority_candidates,
    )


def _candidate_rows(
    raw: Mapping[str, Any],
    *,
    allowed_hosts: frozenset[str],
    accepted_source_types: frozenset[str],
    source_type_classifier: SourceTypeClassifier | None,
    maximum: int,
    url_validator: Callable[[str], bool] | None = None,
) -> tuple[list[_Candidate], int, int, int]:
    """Keep the existing admission result independent of optional diagnostics."""

    result, _rejections = _candidate_rows_with_rejections(
        raw,
        allowed_hosts=allowed_hosts,
        accepted_source_types=accepted_source_types,
        source_type_classifier=source_type_classifier,
        maximum=maximum,
        url_validator=url_validator,
    )
    return result


def _candidate_rows_with_rejections(
    raw: Mapping[str, Any],
    *,
    allowed_hosts: frozenset[str],
    accepted_source_types: frozenset[str],
    source_type_classifier: SourceTypeClassifier | None,
    maximum: int,
    url_validator: Callable[[str], bool] | None = None,
) -> tuple[tuple[list[_Candidate], int, int, int], dict[str, int]]:
    """Return unchanged admission plus code-owned predicate observations.

    Canonical-URL, allowed-host and owner-root failures count input source rows
    at their first rejecting predicate, before deduplication. Source-class
    failures count canonical URLs after deduplication, matching the existing
    classifier gate. These are not distinct-source, provider-query or execution
    counts. No provider-supplied diagnostic fields enter this local dictionary.
    They cover discovery admission only; the legacy aggregate may additionally
    include primary locators or candidates rejected again during merging.
    A missing/malformed source-list shape has no observed predicate counters;
    an observed empty list has known zero rejections. The final operator-only
    sanitizer rechecks the same bounded plain-string-key dictionary contract.
    """

    by_url: dict[str, dict[str, Any]] = {}
    rejected = 0
    malformed = 0
    raw_sources = raw.get("sources")
    if not isinstance(raw_sources, list):
        return ([], 0, 1, 0), {}
    rejections = {
        "discovery_canonical_url_rejected_count": 0,
        "discovery_allowed_host_rejected_count": 0,
        "discovery_owner_root_rejected_count": 0,
        "discovery_source_type_rejected_count": 0,
    }
    for source in raw_sources:
        if not isinstance(source, Mapping):
            malformed += 1
            continue
        url = _canonical_candidate_url(source.get("url"))
        if url is None:
            rejections["discovery_canonical_url_rejected_count"] += 1
            rejected += 1
            continue
        if not _url_matches_allowed_hosts(url, allowed_hosts):
            rejections["discovery_allowed_host_rejected_count"] += 1
            rejected += 1
            continue
        if url_validator is not None and url_validator(url) is not True:
            rejections["discovery_owner_root_rejected_count"] += 1
            rejected += 1
            continue
        row = by_url.setdefault(url, {"titles": [], "snippets": []})
        title = _normalized_text(source.get("title"), maximum=500)
        if title is not None and title.casefold() != "unknown":
            row["titles"].append(title)

    # These snippets are untrusted locators only. They may select a bounded
    # window in a fetched publisher document, but are never copied into a claim
    # or shown to the extractor as independent evidence.
    raw_claims = raw.get("claims")
    if isinstance(raw_claims, list):
        for raw_claim in raw_claims:
            if not isinstance(raw_claim, Mapping):
                continue
            snippet = _normalized_text(raw_claim.get("text"), maximum=12_000)
            urls = raw_claim.get("source_urls")
            if snippet is None or not isinstance(urls, list):
                continue
            for raw_url in urls:
                url = _canonical_candidate_url(raw_url)
                if url in by_url and snippet not in by_url[url]["snippets"]:
                    by_url[url]["snippets"].append(snippet)

    candidates: list[tuple[_Candidate, frozenset[str]]] = []
    # Preserve SearXNG's ranked result order after validation and deduplication;
    # limiting alphabetically would let a lower-ranked host crowd out the most
    # relevant candidate.  Replaying the same immutable provider response still
    # produces the same ordering. When the server provides its trusted source
    # classifier, apply that gate before the limit: an incompatible high-ranked
    # web result must not hide a later eligible authority or reusable locator.
    ranked_rows = list(by_url.items())
    for url, row in ranked_rows:
        titles = _ordered_unique(row["titles"])
        candidate = _Candidate(
            canonical_url=url,
            title=titles[0] if titles else (urlsplit(url).hostname or "Publisher"),
            snippets=tuple(row["snippets"]),
        )
        matched_types = accepted_source_types
        if source_type_classifier is not None:
            try:
                classified_types = frozenset(
                    source_type_classifier(candidate.canonical_url, candidate.title)
                )
            except (TypeError, ValueError):
                classified_types = frozenset()
            matched_types = classified_types.intersection(accepted_source_types)
            if not matched_types:
                rejections["discovery_source_type_rejected_count"] += 1
                rejected += 1
                continue
        candidates.append((candidate, frozenset(matched_types)))

    # When both a specific authority class and generic grounded web are
    # accepted, preserve SearX rank within each class while putting specific
    # matches first. Generic web remains viable; it simply cannot crowd a
    # later, more specific match out of the bounded fetch set.
    specific_source_types = accepted_source_types.difference({"grounded_web"})
    if source_type_classifier is not None and specific_source_types:
        candidates = [
            *(
                row
                for row in candidates
                if row[1].intersection(specific_source_types)
            ),
            *(
                row
                for row in candidates
                if not row[1].intersection(specific_source_types)
            ),
        ]

    omitted = max(0, len(candidates) - maximum)
    return (
        (
            [candidate for candidate, _types in candidates[:maximum]],
            rejected,
            malformed,
            omitted,
        ),
        rejections,
    )


def _primary_response_locator_rows(
    raw: Mapping[str, Any],
    *,
    allowed_hosts: frozenset[str],
    accepted_source_types: frozenset[str],
    source_type_classifier: SourceTypeClassifier | None,
    maximum: int,
    url_validator: Callable[[str], bool] | None = None,
) -> tuple[list[_Candidate], int, int, int]:
    """Extract bounded authority locators from one provider response.

    Provider prose and unsupported Google grounding rows are never evidence.
    Their URL-only locators must pass the same canonical, owner-policy and
    source-class gates before sharing one candidate cap. The publisher is then
    refetched and validated by the same immutable exact-span path as every
    SearX discovery candidate. No provider title or snippet enters extraction.
    """

    rejected = 0
    malformed = 0
    locator_urls: list[tuple[str, bool]] = []
    redirect_hosts: frozenset[str] = frozenset()
    if "_grounding_locator_urls" in raw:
        from backend.services.generative.gemini_search_service import (
            GEMINI_SEARCH_MAX_GROUNDING_CHUNKS,
            TRUSTED_GEMINI_GROUNDING_REDIRECT_HOSTS,
        )

        redirect_hosts = TRUSTED_GEMINI_GROUNDING_REDIRECT_HOSTS
        grounding_urls = raw["_grounding_locator_urls"]
        # This internal channel is a finite producer shape, not authority.
        # Reject unknown/oversized shapes as a whole rather than silently
        # truncating them into a complete discovery result. Keep the existing
        # metadata bound so admission can precede the smaller fetch-locator cap.
        if (
            raw.get("provider") != "gemini_google_search"
            or raw.get("search_performed") is not False
            or raw.get("error") != "MissingGroundingEvidence"
            or not isinstance(grounding_urls, list)
            or len(grounding_urls) > GEMINI_SEARCH_MAX_GROUNDING_CHUNKS
        ):
            malformed += 1
        else:
            for url in grounding_urls:
                if isinstance(url, str):
                    locator_urls.append((url, True))
                else:
                    malformed += 1

    response_text = raw.get("text")
    if isinstance(response_text, str) and response_text:
        locator_urls.extend(
            (match.group(0).rstrip(_HTTPS_LOCATOR_TRAILING_PUNCTUATION), False)
            for match in _HTTPS_LOCATOR_IN_TEXT.finditer(response_text)
        )

    eligible: list[tuple[_Candidate, frozenset[str]]] = []
    seen_urls: set[str] = set()
    for raw_url, grounding_locator in locator_urls:
        if raw_url in seen_urls:
            continue
        if not raw_url and not grounding_locator:
            continue
        seen_urls.add(raw_url)
        canonical_url = _canonical_candidate_url(raw_url)
        if (
            canonical_url is None
            or canonical_url != raw_url
            or (
                grounding_locator
                and urlsplit(canonical_url).hostname in redirect_hosts
            )
            or not _url_matches_allowed_hosts(canonical_url, allowed_hosts)
            or (url_validator is not None and url_validator(canonical_url) is not True)
            or source_type_classifier is None
        ):
            rejected += 1
            continue
        title = urlsplit(canonical_url).hostname or "Publisher"
        try:
            classified_types = frozenset(
                source_type_classifier(canonical_url, title)
            )
        except (TypeError, ValueError):
            classified_types = frozenset()
        matched_types = classified_types.intersection(accepted_source_types)
        if not matched_types:
            rejected += 1
            continue
        eligible.append(
            (
                _Candidate(
                    canonical_url=canonical_url,
                    title=title,
                    # Never copy provider prose into a locator snippet. Windowing
                    # remains driven only by the accepted requirement semantics.
                    snippets=(),
                ),
                matched_types,
            )
        )

    specific_source_types = accepted_source_types.difference({"grounded_web"})
    if specific_source_types:
        eligible = [
            *(row for row in eligible if row[1].intersection(specific_source_types)),
            *(row for row in eligible if not row[1].intersection(specific_source_types)),
        ]
    omitted = max(0, len(eligible) - maximum)
    return (
        [candidate for candidate, _types in eligible[:maximum]],
        rejected,
        malformed,
        omitted,
    )


def _with_primary_response_locators(
    primary: Mapping[str, Any], candidates: list[_Candidate]
) -> dict[str, Any]:
    """Expose accepted response URLs as locator-only source rows.

    The cognitive executor records this separate field only as operation-local
    repair candidates. The rows never enter grounding ``sources`` and carry no
    claim, span, content hash, or verification state; a later targeted repair
    must still refetch and validate publisher bytes.
    """

    if not candidates and isinstance(primary, dict):
        return primary
    result = dict(primary)
    locator_sources = []
    for candidate in candidates:
        locator_sources.append(
            {
                "title": candidate.title,
                "url": candidate.canonical_url,
            }
        )
    result["same_operation_locators"] = locator_sources
    return result


def _reusable_candidate_rows(
    raw: Any, *, allowed_hosts: frozenset[str], maximum: int
) -> tuple[list[_Candidate], int, int, int]:
    """Validate operation-local prior source locators without trusting metadata."""

    if not isinstance(raw, list):
        return [], 0, 1, 0
    rejected = 0
    malformed = 0
    candidates: list[_Candidate] = []
    seen_urls: set[str] = set()
    for source in raw[:_MAX_REUSABLE_SOURCE_CANDIDATES]:
        if not isinstance(source, Mapping) or set(source) != {"title", "url"}:
            malformed += 1
            continue
        url = _canonical_candidate_url(source.get("url"))
        title = _normalized_text(source.get("title"), maximum=500)
        if (
            url is None
            or not _url_matches_allowed_hosts(url, allowed_hosts)
            or url in seen_urls
        ):
            rejected += 1
            continue
        if title is None:
            malformed += 1
            continue
        seen_urls.add(url)
        candidates.append(_Candidate(canonical_url=url, title=title, snippets=()))
    omitted = max(0, len(raw) - _MAX_REUSABLE_SOURCE_CANDIDATES)
    if len(candidates) > maximum:
        omitted += len(candidates) - maximum
        candidates = candidates[:maximum]
    return candidates, rejected, malformed, omitted


def _unique_exact_span(document: str, text: str) -> tuple[int, int] | None:
    document_bytes = document.encode("utf-8")
    text_bytes = text.encode("utf-8")
    first = document_bytes.find(text_bytes)
    if first < 0 or document_bytes.find(text_bytes, first + 1) >= 0:
        return None
    return first, first + len(text_bytes)


def _normalized_locator_token(value: str) -> str | None:
    token = value.casefold()
    if token in {"labeled", "labelled", "labeling", "labelling"}:
        return "label"
    if len(token) < 5 or token in _LOCATOR_STOP_WORDS or not token.isalpha():
        return None
    if len(token) > 6 and token.endswith("ies"):
        token = token[:-3] + "y"
    elif len(token) > 5 and token.endswith("s") and not token.endswith("ss"):
        token = token[:-1]
    return token


def _requirement_locator_terms(value: str) -> dict[str, int]:
    terms: dict[str, int] = {}
    for match in re.finditer(r"[^\W_]+", value, re.UNICODE):
        token = _normalized_locator_token(match.group(0))
        if token is not None:
            terms[token] = max(terms.get(token, 0), len(token))
    return terms


def _requirement_window_start(
    document: str, locator_text: str, maximum_characters: int
) -> int | None:
    terms = _requirement_locator_terms(locator_text)
    if not terms:
        return None
    positions: dict[str, list[int]] = {term: [] for term in terms}
    for match in re.finditer(r"[^\W_]+", document, re.UNICODE):
        token = _normalized_locator_token(match.group(0))
        if token in positions:
            positions[token].append(match.start())
    if not any(positions.values()):
        return None
    last_start = max(0, len(document) - maximum_characters)
    candidate_starts = {0, last_start}
    grid_step = max(1, maximum_characters // 2)
    grid_count = last_start // grid_step + 1
    if grid_count <= _MAX_LOCATOR_WINDOW_GRID_CANDIDATES:
        candidate_starts.update(range(0, last_start + 1, grid_step))
    else:
        candidate_starts.update(
            index
            * last_start
            // (_MAX_LOCATOR_WINDOW_GRID_CANDIDATES - 1)
            for index in range(_MAX_LOCATOR_WINDOW_GRID_CANDIDATES)
        )
    for term_positions in positions.values():
        if not term_positions:
            continue
        candidate_starts.update(
            min(last_start, max(0, position - maximum_characters // 2))
            for position in (term_positions[0], term_positions[-1])
        )
    best_start = 0
    best_score = (-1, -1, -len(document), -len(document), 0)
    document_midpoint = len(document) // 2
    for start in sorted(candidate_starts):
        end = start + maximum_characters
        counts = {
            term: bisect_right(term_positions, end - 1)
            - bisect_left(term_positions, start)
            for term, term_positions in positions.items()
        }
        distinct = {term for term, count in counts.items() if count}
        total_hits = sum(counts.values())
        score = (
            sum(terms[term] for term in distinct),
            len(distinct),
            -total_hits,
            -abs((start + maximum_characters // 2) - document_midpoint),
            -start,
        )
        if score > best_score:
            best_score = score
            best_start = start
    return best_start


def _bounded_document_window(
    document: str,
    snippets: tuple[str, ...],
    maximum_characters: int,
    *,
    locator_text: str = "",
) -> str:
    if len(document) <= maximum_characters:
        return document
    for snippet in snippets:
        first = document.find(snippet)
        if first < 0 or document.find(snippet, first + 1) >= 0:
            continue
        start = max(0, first - maximum_characters // 4)
        start = min(start, len(document) - maximum_characters)
        return document[start : start + maximum_characters]
    requirement_start = _requirement_window_start(
        document, locator_text, maximum_characters
    )
    if requirement_start is not None:
        return document[requirement_start : requirement_start + maximum_characters]
    return document[:maximum_characters]


def _validated_extracted_spans(
    document: str, extraction: ExactSpanExtractionResult
) -> list[_VerifiedSpan]:
    accepted: dict[tuple[int, int, str], _VerifiedSpan] = {}
    for proposed in extraction.spans:
        unique = _unique_exact_span(document, proposed.text)
        if unique is None:
            continue
        expected_text = document[proposed.start : proposed.end]
        if expected_text != proposed.text:
            continue
        start = len(document[: proposed.start].encode("utf-8"))
        end = len(document[: proposed.end].encode("utf-8"))
        if unique != (start, end):
            continue
        accepted[(start, end, proposed.text)] = _VerifiedSpan(
            text=proposed.text,
            segment_start=start,
            segment_end=end,
        )
    return [accepted[key] for key in sorted(accepted)]


def _result_for_document(
    *,
    primary: Mapping[str, Any],
    primary_status: str,
    discovery_status: str,
    candidate: _Candidate,
    document: DirectDocumentSnapshot,
    claims: list[_VerifiedSpan],
    candidate_count: int,
    fetched_count: int,
    query_complete: bool,
    validation_incomplete_count: int,
    rejected_candidate_count: int,
    malformed_candidate_count: int,
    omitted_candidate_count: int,
    primary_diagnostics: Mapping[str, Any],
    discovery_diagnostics: Mapping[str, Any],
    usage_input_tokens: int = 0,
    usage_output_tokens: int = 0,
) -> dict[str, Any]:
    result = {
        "text": document.text,
        "sources": [
            {
                "title": candidate.title,
                "url": document.canonical_url,
                "provider": "searxng_direct_fetch",
                "provider_source_id": (
                    "searxng-direct-"
                    + hashlib.sha256(document.canonical_url.encode("utf-8")).hexdigest()[:20]
                ),
                "provider_response_hash": document.content_sha256,
                "retrieved_at": document.retrieved_at,
                "citation_metadata": {
                    "content_sha256": document.content_sha256,
                    "discovery_url": candidate.canonical_url,
                },
            }
        ],
        "claims": [
            {
                "text": claim.text,
                "source_urls": [document.canonical_url],
                "provider": "searxng_direct_fetch",
                "provider_response_hash": document.content_sha256,
                "segment_start": claim.segment_start,
                "segment_end": claim.segment_end,
                "offset_unit": "utf8_bytes",
                "span_target": "provider_response_text",
            }
            for claim in claims
        ],
        "provider": "searxng_direct_fetch",
        "provider_response_hash": document.content_sha256,
        "search_performed": True,
        "runtime_diagnostics": _fallback_runtime_diagnostics(
            status=discovery_status,
            primary_status=primary_status,
            primary_diagnostics=primary_diagnostics,
            discovery_diagnostics=discovery_diagnostics,
            candidate_count=candidate_count,
            fetched_count=fetched_count,
            query_complete=query_complete,
            validation_incomplete_count=validation_incomplete_count,
            rejected_candidate_count=rejected_candidate_count,
            malformed_candidate_count=malformed_candidate_count,
            omitted_candidate_count=omitted_candidate_count,
            claim_count=len(claims),
            usage_input_tokens=usage_input_tokens,
            usage_output_tokens=usage_output_tokens,
            primary_provider_query_count=len(_primary_provider_queries(primary)),
        ),
    }
    return _apply_primary_metering(
        result,
        primary,
        extractor_input_tokens=usage_input_tokens,
        extractor_output_tokens=usage_output_tokens,
    )


def _empty_fallback_result(
    *,
    primary: Mapping[str, Any],
    primary_status: str,
    candidate_count: int,
    fetched_count: int,
    query_complete: bool,
    validation_incomplete_count: int,
    rejected_candidate_count: int,
    malformed_candidate_count: int,
    omitted_candidate_count: int,
    primary_diagnostics: Mapping[str, Any],
    discovery_diagnostics: Mapping[str, Any],
    usage_input_tokens: int = 0,
    usage_output_tokens: int = 0,
) -> dict[str, Any]:
    result = {
        "text": "",
        "sources": [],
        "claims": [],
        "provider": "searxng_direct_fetch",
        "search_performed": True,
        "runtime_diagnostics": _fallback_runtime_diagnostics(
            status="empty",
            primary_status=primary_status,
            primary_diagnostics=primary_diagnostics,
            discovery_diagnostics=discovery_diagnostics,
            candidate_count=candidate_count,
            fetched_count=fetched_count,
            query_complete=query_complete,
            validation_incomplete_count=validation_incomplete_count,
            rejected_candidate_count=rejected_candidate_count,
            malformed_candidate_count=malformed_candidate_count,
            omitted_candidate_count=omitted_candidate_count,
            claim_count=0,
            usage_input_tokens=usage_input_tokens,
            usage_output_tokens=usage_output_tokens,
            primary_provider_query_count=len(_primary_provider_queries(primary)),
        ),
    }
    return _apply_primary_metering(
        result,
        primary,
        extractor_input_tokens=usage_input_tokens,
        extractor_output_tokens=usage_output_tokens,
    )


def _primary_with_failed_fallback(
    primary: dict[str, Any],
    *,
    status: str,
    discovery_diagnostics: Mapping[str, Any] | None = None,
    usage_input_tokens: int = 0,
    usage_output_tokens: int = 0,
    extractor_usage_complete: bool = True,
    fetched_count: int = 0,
    fetch_error_count: int = 0,
    validation_incomplete_count: int = 0,
    query_complete: bool | None = None,
    rejected_candidate_count: int = 0,
    malformed_candidate_count: int = 0,
    omitted_candidate_count: int = 0,
) -> dict[str, Any]:
    result = dict(primary)
    raw_primary_diagnostics = primary.get("runtime_diagnostics")
    primary_diagnostics = (
        raw_primary_diagnostics
        if isinstance(raw_primary_diagnostics, Mapping)
        else {}
    )
    primary_status = _finite_status(primary_diagnostics.get("status"), default="unavailable")
    diagnostics = _finite_phase_diagnostics(
        primary_diagnostics,
        route="gemini_google_search",
        status=primary_status,
    )
    fallback_status = _finite_status(status)
    fallback: dict[str, Any] = {
        "route": "searxng_direct_fetch",
        "status": fallback_status,
        "extractor": {
            "input_tokens": usage_input_tokens,
            "output_tokens": usage_output_tokens,
        },
        "fetched_count": fetched_count,
        "fetch_error_count": fetch_error_count,
        "validation_incomplete_count": validation_incomplete_count,
        "rejected_candidate_count": rejected_candidate_count,
        "malformed_candidate_count": malformed_candidate_count,
        "omitted_candidate_count": omitted_candidate_count,
        "primary_provider_query_count": len(_primary_provider_queries(primary)),
    }
    if query_complete is not None:
        fallback["query_complete"] = query_complete
    if discovery_diagnostics is not None:
        actual_discovery_status = _finite_status(
            discovery_diagnostics.get("status"), default="unavailable"
        )
        fallback["discovery"] = _finite_phase_diagnostics(
            discovery_diagnostics,
            route="searxng",
            status=actual_discovery_status,
        )
    diagnostics.update(
        {
            "fallback_attempted": True,
            "fallback_used": False,
            "fallback": fallback,
        }
    )
    result["runtime_diagnostics"] = diagnostics
    result = _apply_primary_metering(
        result,
        primary,
        extractor_input_tokens=usage_input_tokens,
        extractor_output_tokens=usage_output_tokens,
    )
    if not extractor_usage_complete:
        # A timed-out/failed model call may still be billable. Preserve observed
        # primary receipts in diagnostics, but never label aggregate cost zero.
        diagnostics["usage_complete"] = False
        observed_primary = {
            key: primary_diagnostics[key]
            for key in ("input_tokens", "output_tokens", "total_tokens")
            if type(primary_diagnostics.get(key)) is int
            and 0 <= primary_diagnostics[key] <= 2_000_000
        }
        if observed_primary:
            diagnostics["primary"] = {
                "route": "gemini_google_search", "status": primary_status,
                **observed_primary,
            }
            if type(primary_diagnostics.get("usage_complete")) is bool:
                diagnostics["primary"]["usage_complete"] = primary_diagnostics["usage_complete"]
        result["usage_metadata"].update(
            input_tokens=None, output_tokens=None, total_tokens=None,
            inputTokens=None, outputTokens=None, totalTokens=None,
            usage_complete=False,
        )
    return result


def _all_discovery_engines_unresponsive(diagnostics: Mapping[str, Any]) -> bool:
    rows = diagnostics.get("unresponsive_engines")
    if not isinstance(rows, list):
        return False
    engines = {
        str(row.get("engine") or "").casefold()
        for row in rows
        if isinstance(row, Mapping)
    }
    return _CONFIGURED_DISCOVERY_ENGINES.issubset(engines)


def _fallback_eligible_primary_status(primary: Mapping[str, Any]) -> str | None:
    if primary.get("search_performed") is True:
        return None
    raw_diagnostics = primary.get("runtime_diagnostics")
    diagnostics = raw_diagnostics if isinstance(raw_diagnostics, Mapping) else {}
    status = str(diagnostics.get("status") or "")
    return status if status in _FALLBACK_PRIMARY_STATUSES else None


def _cooldown_primary_result(
    status: str, *, retry_after_seconds: int
) -> dict[str, Any]:
    """Describe an intentional no-call without inventing provider activity."""

    return {
        "text": "",
        "sources": [],
        "claims": [],
        "provider": "gemini_google_search",
        "search_performed": False,
        "usage_metadata": _usage_metadata(0, 0),
        "runtime_diagnostics": {
            "route": "gemini_google_search",
            "status": status,
            "elapsed_ms": 0,
            "call_count": 0,
            "retry_count": 0,
            "primary_skipped": True,
            "circuit_state": "open",
            "retry_after_seconds": retry_after_seconds,
        },
    }


class ResilientResearchRunner:
    """Use bounded direct-source acquisition after selected Gemini transients."""

    def __init__(
        self,
        primary: ResearchRunner,
        *,
        searxng: SearxngSearchService | Any | None = None,
        fetcher: DirectTextFetcher = _default_fetch_direct_text,
        extractor: DirectDocumentExtractor | None = None,
        maximum_candidates: int = 3,
        maximum_document_characters: int = _MAX_DOCUMENT_CHARACTERS,
        primary_cooldown_seconds: float = _DEFAULT_PRIMARY_COOLDOWN_SECONDS,
        primary_healthy_seconds: float = _DEFAULT_PRIMARY_HEALTHY_SECONDS,
        fallback_phase_seconds: float = WORKFLOW_V2_FALLBACK_PHASE_SECONDS,
        discovery_seconds: float = _FALLBACK_DISCOVERY_SECONDS,
        monotonic_clock: Callable[[], float] = time.monotonic,
        source_type_classifier: SourceTypeClassifier | None = None,
        source_url_validator: Callable[[str, str], bool] | None = None,
    ) -> None:
        if maximum_candidates < 1 or maximum_candidates > 10:
            raise ValueError("maximum_candidates must be between 1 and 10")
        if (
            maximum_document_characters < 1
            or maximum_document_characters > MAX_DOCUMENT_CODE_POINTS
        ):
            raise ValueError(
                f"maximum_document_characters must be between 1 and {MAX_DOCUMENT_CODE_POINTS}"
            )
        try:
            normalized_cooldown = float(primary_cooldown_seconds)
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("primary_cooldown_seconds must be finite") from error
        if (
            not math.isfinite(normalized_cooldown)
            or normalized_cooldown <= 0
            or normalized_cooldown > _MAX_PRIMARY_COOLDOWN_SECONDS
        ):
            raise ValueError(
                "primary_cooldown_seconds must be greater than 0 and at most "
                f"{_MAX_PRIMARY_COOLDOWN_SECONDS:g}"
            )
        try:
            normalized_healthy = float(primary_healthy_seconds)
            normalized_fallback_phase = float(fallback_phase_seconds)
            normalized_discovery = float(discovery_seconds)
        except (TypeError, ValueError, OverflowError) as error:
            raise ValueError("research runner phase limits must be finite") from error
        if (
            not math.isfinite(normalized_healthy)
            or normalized_healthy <= 0
            or normalized_healthy > _MAX_PRIMARY_HEALTHY_SECONDS
        ):
            raise ValueError(
                "primary_healthy_seconds must be greater than 0 and at most "
                f"{_MAX_PRIMARY_HEALTHY_SECONDS:g}"
            )
        if (
            not math.isfinite(normalized_discovery)
            or normalized_discovery <= 0
            or normalized_discovery > _MAX_FALLBACK_DISCOVERY_SECONDS
        ):
            raise ValueError(
                "discovery_seconds must be greater than 0 and at most "
                f"{_MAX_FALLBACK_DISCOVERY_SECONDS:g}"
            )
        if (
            not math.isfinite(normalized_fallback_phase)
            or normalized_fallback_phase <= 0
            or normalized_fallback_phase > WORKFLOW_V2_FALLBACK_PHASE_SECONDS
        ):
            raise ValueError(
                "fallback_phase_seconds must be greater than 0 and at most "
                f"{WORKFLOW_V2_FALLBACK_PHASE_SECONDS:g}"
            )
        self.primary = primary
        if source_url_validator is not None and not callable(source_url_validator):
            raise ValueError("Source URL policy must be callable")
        self.source_url_validator = source_url_validator
        self.searxng = searxng or SearxngSearchService()
        self.fetcher = fetcher
        self.extractor = extractor
        self.maximum_candidates = maximum_candidates
        self.maximum_document_characters = maximum_document_characters
        self.primary_cooldown_seconds = normalized_cooldown
        self.primary_healthy_seconds = normalized_healthy
        self.fallback_phase_seconds = normalized_fallback_phase
        self.discovery_seconds = normalized_discovery
        self.source_type_classifier = source_type_classifier
        self._monotonic_clock = monotonic_clock
        self._primary_condition = asyncio.Condition()
        self._primary_gate_in_flight = False
        self._primary_started_version = 0
        self._primary_completed_version = 0
        self._primary_generation = 0
        self._primary_cooldown_until = 0.0
        self._primary_cooldown_status = "unavailable"
        self._primary_healthy_until = 0.0
        self._lifecycle_condition = asyncio.Condition()
        self._close_lock = asyncio.Lock()
        self._active_searches = 0
        self._closing = False
        self._closed = False

    def _cooldown_result_if_open(self) -> dict[str, Any] | None:
        now = self._monotonic_clock()
        if now >= self._primary_cooldown_until:
            return None
        retry_after_seconds = max(
            1,
            min(
                int(_MAX_PRIMARY_COOLDOWN_SECONDS),
                math.ceil(self._primary_cooldown_until - now),
            ),
        )
        return _cooldown_primary_result(
            self._primary_cooldown_status,
            retry_after_seconds=retry_after_seconds,
        )

    async def _enter_search(self) -> None:
        async with self._lifecycle_condition:
            if self._closing or self._closed:
                raise RuntimeError("research runner is closed")
            self._active_searches += 1

    async def _leave_search(self) -> None:
        async with self._lifecycle_condition:
            self._active_searches -= 1
            if self._active_searches == 0:
                self._lifecycle_condition.notify_all()

    async def _restore_open_after_close_cancel(self) -> None:
        async with self._lifecycle_condition:
            self._closing = False
            self._lifecycle_condition.notify_all()

    async def _mark_closed_after_shutdown(self) -> None:
        async with self._lifecycle_condition:
            self._closed = True
            self._closing = False
            self._lifecycle_condition.notify_all()

    def _next_primary_version(self) -> int:
        self._primary_started_version += 1
        return self._primary_started_version

    async def _release_primary_gate(self) -> None:
        async with self._primary_condition:
            self._primary_gate_in_flight = False
            self._primary_condition.notify_all()

    async def _complete_primary_call(
        self,
        *,
        version: int,
        generation: int,
        primary: Mapping[str, Any],
        owns_gate: bool,
    ) -> None:
        async with self._primary_condition:
            self._primary_completed_version = max(
                self._primary_completed_version, version
            )
            now = self._monotonic_clock()
            status = _fallback_eligible_primary_status(primary)
            if status in {"quality_rejected", "grounding_evidence_missing"}:
                # Returned prose without usable grounding, like a publication
                # defect, proves no provider outage. Retain the circuit state;
                # only this request uses the existing verified fallback.
                pass
            elif status is not None:
                # Any in-flight query that observes a transient latches the
                # cooldown. Concurrent successes cannot immediately re-enable
                # a provider that just failed another requirement.
                self._primary_cooldown_until = max(
                    self._primary_cooldown_until,
                    now + self.primary_cooldown_seconds,
                )
                self._primary_cooldown_status = status
                self._primary_healthy_until = 0.0
                runtime_diagnostics = primary.get("runtime_diagnostics")
                if isinstance(runtime_diagnostics, dict):
                    runtime_diagnostics["retry_after_seconds"] = max(
                        1,
                        min(
                            int(_MAX_PRIMARY_COOLDOWN_SECONDS),
                            math.ceil(self._primary_cooldown_until - now),
                        ),
                    )
                # Every observed transient invalidates all successes that were
                # already in flight. Only a call started in this new generation
                # may later establish provider health.
                self._primary_generation += 1
            elif primary.get("search_performed") is True:
                completion_is_current = generation == self._primary_generation
                if owns_gate and completion_is_current:
                    # A gate can run only after cooldown expiry. Its success is
                    # the sole authority that closes the in-memory circuit.
                    self._primary_cooldown_until = 0.0
                    self._primary_healthy_until = now + self.primary_healthy_seconds
                elif completion_is_current and now >= self._primary_cooldown_until:
                    self._primary_healthy_until = max(
                        self._primary_healthy_until,
                        now + self.primary_healthy_seconds,
                    )
            elif owns_gate and generation == self._primary_generation:
                # A configuration or non-retryable gate result fails closed and
                # leaves availability unknown for the next caller. It never
                # opens the transient circuit.
                if now >= self._primary_cooldown_until:
                    self._primary_cooldown_until = 0.0
                self._primary_healthy_until = 0.0
            if owns_gate:
                self._primary_gate_in_flight = False
            self._primary_condition.notify_all()

    async def _search_primary(self, query: str) -> dict[str, Any]:
        """Gate initial availability; never share query content or usage."""

        while True:
            async with self._primary_condition:
                cooldown = self._cooldown_result_if_open()
                if cooldown is not None:
                    return cooldown
                if self._monotonic_clock() < self._primary_healthy_until:
                    version = self._next_primary_version()
                    generation = self._primary_generation
                    owns_gate = False
                    break
                if not self._primary_gate_in_flight:
                    self._primary_gate_in_flight = True
                    version = self._next_primary_version()
                    generation = self._primary_generation
                    owns_gate = True
                    break
                await self._primary_condition.wait()

        try:
            primary = await self.primary.search(query)
        except BaseException:
            if owns_gate:
                await _await_cancellation_safe(self._release_primary_gate())
            raise
        try:
            await self._complete_primary_call(
                version=version,
                generation=generation,
                primary=primary,
                owns_gate=owns_gate,
            )
        except BaseException:
            if owns_gate:
                await _await_cancellation_safe(self._release_primary_gate())
            raise
        return primary

    async def _discover(self, query: str) -> Mapping[str, Any]:
        method = getattr(self.searxng, "search_web_general_async", None)
        if method is None:
            method = getattr(self.searxng, "search_web_general", None)
        if method is None or not inspect.iscoroutinefunction(method):
            raise TypeError("workflow-v2 SearXNG discovery must be asynchronous")
        result = await method(query)
        return result if isinstance(result, Mapping) else {}

    async def search(self, query: str) -> dict[str, Any]:
        await self._enter_search()
        try:
            return await self._search_active(query)
        finally:
            await _await_cancellation_safe(self._leave_search())

    async def _search_active(self, query: str) -> dict[str, Any]:
        def url_allowed(url: str) -> bool:
            return self.source_url_validator is None or self.source_url_validator(query, url) is True

        context = _fallback_context(query)
        locator_refetch = bool(context and context.reusable_candidates)
        if locator_refetch:
            # A targeted repair pass carries only operation-local locators that the
            # initial provider response already discovered. Do not ask Gemini to
            # restate them: refetch immutable publisher bytes and bind exact spans.
            primary = {
                "text": "",
                "sources": [],
                "claims": [],
                "search_performed": False,
                "runtime_diagnostics": {
                    "route": "gemini_google_search",
                    "status": "same_operation_locator_refetch",
                    "elapsed_ms": 0,
                    "call_count": 0,
                    "retry_count": 0,
                },
            }
        else:
            primary = await self._search_primary(query)
        (
            primary_locator_candidates,
            primary_locator_rejected,
            primary_locator_malformed,
            primary_locator_omitted,
        ) = _primary_response_locator_rows(
            primary,
            allowed_hosts=(context.allowed_hosts if context else frozenset()),
            accepted_source_types=(
                frozenset(context.accepted_source_types)
                if context
                else frozenset()
            ),
            source_type_classifier=self.source_type_classifier,
            maximum=_MAX_REUSABLE_SOURCE_CANDIDATES,
            url_validator=url_allowed,
        )
        if primary.get("search_performed") is True and not locator_refetch:
            return _with_primary_response_locators(
                primary, primary_locator_candidates
            )
        raw_primary_diagnostics = primary.get("runtime_diagnostics")
        primary_diagnostics = (
            raw_primary_diagnostics
            if isinstance(raw_primary_diagnostics, Mapping)
            else {}
        )
        primary_status = str(primary_diagnostics.get("status") or "")
        if not locator_refetch and primary_status not in _FALLBACK_PRIMARY_STATUSES:
            return primary
        logger.info(
            "Workflow-v2 research fallback started; primary_status=%s",
            primary_status,
        )
        fallback_started_at = self._monotonic_clock()
        # Operator-only facts are local to this fallback, not provider-authored
        # diagnostics or public wire fields. A phase is entered before its work;
        # counts are added only after the corresponding observation completes.
        evidence_facts: dict[str, object] = {"stage": "context"}
        primary_fields = plain_diagnostic_fields(primary)
        primary_query_receipt = (
            primary_fields.get("provider_queries")
            if primary_fields is not None else None
        )
        if (
            type(primary_query_receipt) is list
            and len(primary_query_receipt) <= 10_000
            and all(type(item) is str for item in primary_query_receipt)
        ):
            evidence_facts["primary_provider_query_count"] = len(
                primary_query_receipt
            )

        def finish_fallback(result: dict[str, Any]) -> dict[str, Any]:
            result = _with_fallback_elapsed(
                result,
                elapsed_ms=_finite_elapsed_ms(
                    fallback_started_at,
                    self._monotonic_clock(),
                ),
            )
            diagnostics = result.get("runtime_diagnostics")
            if isinstance(diagnostics, dict):
                # Snapshot only exact bounded primitives; never alias the
                # provider response or leak raw discovery fields into logging.
                result["runtime_diagnostics"] = {
                    **diagnostics,
                    "evidence": sanitize_research_evidence_diagnostics(
                        evidence_facts
                    ),
                }
            return result

        fallback_deadline = (
            asyncio.get_running_loop().time() + self.fallback_phase_seconds
        )

        context = context or _fallback_context(query)
        if context is None:
            return finish_fallback(
                _primary_with_failed_fallback(
                    primary, status="invalid_canonical_input"
                )
            )

        evidence_facts["query_complete"] = context.query_complete
        evidence_facts["stage"] = "discovery"
        discovery_started_at = self._monotonic_clock()
        try:
            discovery_deadline = min(
                fallback_deadline,
                asyncio.get_running_loop().time() + self.discovery_seconds,
            )
            async with asyncio.timeout_at(discovery_deadline):
                discovery = await self._discover(context.discovery_query)
        except TimeoutError:
            logger.warning(
                "Workflow-v2 research fallback phase stopped; phase=discovery "
                "status=deadline_exceeded elapsed_ms=%s call_count=1",
                _finite_elapsed_ms(discovery_started_at, self._monotonic_clock()),
            )
            if (
                not context.reusable_candidates
                and not context.authority_candidates
                and not primary_locator_candidates
            ):
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        status="fallback_deadline_exceeded",
                        query_complete=context.query_complete,
                    )
                )
            discovery = {}
            discovery_diagnostics = {
                "route": "searxng",
                "status": "deadline_exceeded",
                "elapsed_ms": _finite_elapsed_ms(
                    discovery_started_at, self._monotonic_clock()
                ),
                "call_count": 1,
                "retry_count": 0,
            }
        except Exception:
            if (
                not context.reusable_candidates
                and not context.authority_candidates
                and not primary_locator_candidates
            ):
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        status="error",
                        query_complete=context.query_complete,
                    )
                )
            discovery = {}
            discovery_diagnostics = {
                "route": "searxng",
                "status": "error",
                "elapsed_ms": _finite_elapsed_ms(
                    discovery_started_at, self._monotonic_clock()
                ),
                "call_count": 1,
                "retry_count": 0,
            }
        else:
            raw_discovery_diagnostics = discovery.get("runtime_diagnostics")
            discovery_diagnostics = (
                raw_discovery_diagnostics
                if isinstance(raw_discovery_diagnostics, Mapping)
                else {}
            )
        # Preserve the adapter's bounded receipts before phase diagnostics drop
        # them. The final sanitizer rejects bools, coercions and out-of-range
        # values; absent receipts remain unknown rather than inferred from rows.
        # Optional instrumentation must not invoke custom Mapping getters or
        # colliding non-string dictionary keys during an otherwise safe read.
        discovery_fields = plain_diagnostic_fields(discovery_diagnostics)
        if discovery_fields is not None:
            for field, provider_field in (
                ("discovery_result_count", "result_count"),
                ("discovery_invalid_result_count", "invalid_result_count"),
            ):
                if provider_field in discovery_fields:
                    evidence_facts[field] = discovery_fields[provider_field]
        discovery_status = str(discovery_diagnostics.get("status") or "")
        # The internal SearX adapter is the authority for whether its response
        # shape was processed successfully.  A stray or malformed
        # ``search_performed`` flag must never turn an unknown/error status into
        # a successful empty result that suppresses the primary transient.
        discovery_healthy = discovery_status in _HEALTHY_DISCOVERY_STATUSES
        if (
            not discovery.get("search_performed")
            and discovery_status == "empty"
            and _all_discovery_engines_unresponsive(discovery_diagnostics)
        ):
            discovery_healthy = False
            discovery_status = "all_engines_unresponsive"
            discovery_diagnostics = {
                **discovery_diagnostics,
                "status": discovery_status,
            }
        if (
            not discovery_healthy
            and not context.reusable_candidates
            and not context.authority_candidates
            and not primary_locator_candidates
        ):
            return finish_fallback(
                _primary_with_failed_fallback(
                    primary,
                    status=discovery_status or "unavailable",
                    discovery_diagnostics=discovery_diagnostics,
                    query_complete=context.query_complete,
                )
            )

        evidence_facts["stage"] = "admission"
        # This pre-existing primary-locator observation is separate from the
        # discovery predicates. Its helper deduplicates exact raw URL strings;
        # it is not a provider-call count. The legacy total remains unchanged.
        evidence_facts["primary_locator_rejected_count"] = primary_locator_rejected
        if discovery_healthy:
            admission, discovery_rejections = _candidate_rows_with_rejections(
                discovery,
                allowed_hosts=context.allowed_hosts,
                accepted_source_types=frozenset(context.accepted_source_types),
                source_type_classifier=self.source_type_classifier,
                maximum=(
                    self.maximum_candidates + len(context.reusable_candidates)
                ),
                url_validator=url_allowed,
            )
            search_candidates, rejected_count, malformed_count, omitted_count = admission
            evidence_facts.update(discovery_rejections)
        else:
            search_candidates = []
            rejected_count = malformed_count = omitted_count = 0
        rejected_count += primary_locator_rejected
        malformed_count += primary_locator_malformed
        omitted_count += primary_locator_omitted
        discovered_candidates = [
            *context.authority_candidates,
            *primary_locator_candidates,
            *search_candidates,
        ]
        merged_candidates_by_url: dict[str, _Candidate] = {}
        for candidate in (*context.reusable_candidates, *discovered_candidates):
            if not url_allowed(candidate.canonical_url):
                rejected_count += 1
                continue
            existing = merged_candidates_by_url.get(candidate.canonical_url)
            if existing is None:
                merged_candidates_by_url[candidate.canonical_url] = candidate
                continue
            merged_candidates_by_url[candidate.canonical_url] = _Candidate(
                canonical_url=existing.canonical_url,
                title=existing.title,
                snippets=tuple(
                    dict.fromkeys((*existing.snippets, *candidate.snippets))
                ),
            )
        reusable_urls = [
            candidate.canonical_url for candidate in context.reusable_candidates
        ]
        discovered_urls = [
            candidate.canonical_url for candidate in discovered_candidates
        ]
        selected_urls: list[str] = []
        # On the single locator-refetch pass, preserve the operation-local URL's
        # opportunity to be independently fetched. Fresh discovery can otherwise
        # fill the bounded candidate cap and silently crowd out the very publisher
        # locator that caused this repair. Spare capacity still goes to explicit
        # authorities and ranked discovery. A duplicate URL keeps the fresh snippets
        # merged above for relevant-window selection.
        prioritized_url_groups = (
            (reusable_urls, discovered_urls)
            if locator_refetch
            else (discovered_urls, reusable_urls)
        )
        for urls in prioritized_url_groups:
            for url in urls:
                if (
                    url in merged_candidates_by_url
                    and
                    url not in selected_urls
                    and len(selected_urls) < self.maximum_candidates
                ):
                    selected_urls.append(url)
        merged_candidates = [merged_candidates_by_url[url] for url in selected_urls]
        all_merged_candidate_count = len(merged_candidates_by_url)
        if all_merged_candidate_count > self.maximum_candidates:
            omitted_count += all_merged_candidate_count - self.maximum_candidates
        candidates = merged_candidates
        # The adapter returns only sanitized source rows. Preserve its bounded
        # count of discarded provider rows so a mixed valid/malformed response
        # cannot later become an authoritative zero-evidence result.
        malformed_count += _finite_diagnostic_int(
            discovery_diagnostics,
            "invalid_result_count",
            maximum=10_000,
        )
        evidence_facts.update(
            candidate_count=len(candidates),
            rejected_candidate_count=rejected_count,
            omitted_candidate_count=omitted_count,
        )
        if discovery_fields is not None:
            adapter_invalid_count = discovery_fields.get(
                "invalid_result_count"
            )
            if "invalid_result_count" not in discovery_fields or (
                type(adapter_invalid_count) is int
                and 0 <= adapter_invalid_count <= 10_000
            ):
                evidence_facts["malformed_candidate_count"] = malformed_count
        # Existing decision counters deliberately remain unchanged. If their
        # legacy coercion included an invalid adapter receipt, do not advertise
        # the derived malformed aggregate as an observed evidence fact.
        if not candidates:
            evidence_facts.update(
                fetched_count=0,
                fetch_error_count=0,
                validation_incomplete_count=0,
                claim_count=0,
            )
            if not context.query_complete:
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        status="discovery_query_incomplete",
                        discovery_diagnostics=discovery_diagnostics,
                        query_complete=False,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            if rejected_count or malformed_count or omitted_count:
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        status="discovery_rows_incomplete",
                        discovery_diagnostics=discovery_diagnostics,
                        query_complete=True,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            return finish_fallback(
                _empty_fallback_result(
                    primary=primary,
                    primary_status=primary_status,
                    candidate_count=0,
                    fetched_count=0,
                    query_complete=True,
                    validation_incomplete_count=0,
                    rejected_candidate_count=rejected_count,
                    malformed_candidate_count=malformed_count,
                    omitted_candidate_count=omitted_count,
                    primary_diagnostics=primary_diagnostics,
                    discovery_diagnostics=discovery_diagnostics,
                )
            )

        fetch_semaphore = asyncio.Semaphore(3)
        fetch_failure_categories: dict[str, int] = {}

        def count_fetch_failure(category: str) -> None:
            fetch_failure_categories[category] = (
                fetch_failure_categories.get(category, 0) + 1
            )

        async def fetch_candidate(
            candidate: _Candidate,
        ) -> tuple[_Candidate, Mapping[str, Any] | None, bool]:
            async with fetch_semaphore:
                try:
                    if self.fetcher is _default_fetch_direct_text and self.source_url_validator is not None:
                        raw_document = await _default_fetch_direct_text(
                            candidate.canonical_url, url_validator=url_allowed,
                        )
                    else:
                        raw_document = await self.fetcher(candidate.canonical_url)
                except Exception as error:
                    count_fetch_failure(_fetch_failure_category(error))
                    return candidate, None, True
            if not isinstance(raw_document, Mapping):
                count_fetch_failure("invalid_mapping")
                return candidate, None, True
            return candidate, raw_document, False

        evidence_facts["stage"] = "fetch"
        try:
            fetch_deadline = min(
                fallback_deadline,
                asyncio.get_running_loop().time() + _FALLBACK_FETCH_SECONDS,
            )
            async with asyncio.timeout_at(fetch_deadline):
                fetch_results = await asyncio.gather(
                    *(fetch_candidate(candidate) for candidate in candidates)
                )
        except TimeoutError:
            logger.warning(
                "Workflow-v2 research fallback phase stopped; phase=fetch "
                "status=deadline_exceeded candidates=%s failure_categories=%s",
                len(candidates),
                json.dumps(fetch_failure_categories, sort_keys=True),
            )
            return finish_fallback(
                _primary_with_failed_fallback(
                    primary,
                    status="fallback_deadline_exceeded",
                    discovery_diagnostics=discovery_diagnostics,
                    fetched_count=0,
                    fetch_error_count=len(candidates),
                    query_complete=context.query_complete,
                    rejected_candidate_count=rejected_count,
                    malformed_candidate_count=malformed_count,
                    omitted_candidate_count=omitted_count,
                )
            )
        raw_fetch_count = sum(
            1 for _candidate, raw_document, _failed in fetch_results if raw_document
        )
        fetch_error_count = sum(1 for _candidate, _raw, failed in fetch_results if failed)
        validation_incomplete_count = 0
        requirement_locator_text = "\n".join(
            (
                str(context.requirement.get("description") or ""),
                context.applies_when,
            )
        )
        fetched_documents: list[
            tuple[_Candidate, DirectDocumentSnapshot, BoundedFetchedDocument]
        ] = []
        seen_document_ids: set[str] = set()
        for candidate, raw_document, _failed in fetch_results:
            if raw_document is None:
                continue
            final_url = _canonical_candidate_url(raw_document.get("final_url"))
            if (
                final_url is None or not _url_matches_allowed_hosts(final_url, context.allowed_hosts)
                or not url_allowed(final_url)
            ):
                rejected_count += 1
                validation_incomplete_count += 1
                count_fetch_failure("final_url_rejected")
                continue
            raw_text = raw_document.get("text")
            if not isinstance(raw_text, str) or not raw_text:
                validation_incomplete_count += 1
                count_fetch_failure("empty_text")
                continue
            document_text = _bounded_document_window(
                raw_text,
                candidate.snippets,
                self.maximum_document_characters,
                locator_text=requirement_locator_text,
            )
            if not document_text:
                validation_incomplete_count += 1
                count_fetch_failure("empty_window")
                continue
            retrieved_at = raw_document.get("retrieved_at")
            if not isinstance(retrieved_at, str) or not retrieved_at.strip():
                retrieved_at = datetime.now(timezone.utc).isoformat()
            snapshot = DirectDocumentSnapshot(
                canonical_url=final_url,
                title=candidate.title,
                text=document_text,
                content_sha256=hashlib.sha256(document_text.encode("utf-8")).hexdigest(),
                retrieved_at=retrieved_at,
            )

            document_id = (
                "source-"
                + hashlib.sha256(
                    f"{final_url}\n{snapshot.content_sha256}".encode("utf-8")
                ).hexdigest()[:32]
            )
            if document_id not in seen_document_ids:
                seen_document_ids.add(document_id)
                fetched_documents.append(
                    (
                        candidate,
                        snapshot,
                        BoundedFetchedDocument(
                            document_id=document_id,
                            title=candidate.title,
                            text=document_text,
                        ),
                    )
                )

        fetched_count = len(fetched_documents)
        incomplete_fetch_count = fetch_error_count + validation_incomplete_count
        # gather and document validation have both completed. In particular,
        # a timeout above leaves these facts absent even if one fetch coroutine
        # happened to finish; it did not establish a completed validated batch.
        evidence_facts.update(
            fetched_count=fetched_count,
            fetch_error_count=fetch_error_count,
            validation_incomplete_count=validation_incomplete_count,
            rejected_candidate_count=rejected_count,
        )
        logger.log(
            logging.WARNING if incomplete_fetch_count else logging.INFO,
            "Workflow-v2 research fallback fetch completed; candidates=%s fetched=%s "
            "fetch_errors=%s validation_incomplete=%s failure_categories=%s",
            len(candidates),
            fetched_count,
            fetch_error_count,
            validation_incomplete_count,
            json.dumps(fetch_failure_categories, sort_keys=True),
        )
        if not fetched_documents and incomplete_fetch_count:
            return finish_fallback(
                _primary_with_failed_fallback(
                    primary,
                    status=(
                        "direct_fetch_error"
                        if raw_fetch_count == 0
                        else "direct_fetch_incomplete"
                    ),
                    discovery_diagnostics=discovery_diagnostics,
                    fetched_count=fetched_count,
                    fetch_error_count=fetch_error_count,
                    validation_incomplete_count=validation_incomplete_count,
                    query_complete=context.query_complete,
                    rejected_candidate_count=rejected_count,
                    malformed_candidate_count=malformed_count,
                    omitted_candidate_count=omitted_count,
                )
            )
        if fetched_documents and self.extractor is None:
            return finish_fallback(
                _primary_with_failed_fallback(
                    primary,
                    status="exact_span_extractor_unavailable",
                    discovery_diagnostics=discovery_diagnostics,
                    fetched_count=fetched_count,
                    fetch_error_count=fetch_error_count,
                    validation_incomplete_count=validation_incomplete_count,
                    query_complete=context.query_complete,
                    rejected_candidate_count=rejected_count,
                    malformed_candidate_count=malformed_count,
                    omitted_candidate_count=omitted_count,
                )
            )
        if fetched_documents and self.extractor is not None:
            # Gate A: TypeSafe Jev accelerated evidence triage
            from backend.services.workflow_v2.cognitive.typesafe_triage import filter_documents_with_jev
            filtered_docs = await filter_documents_with_jev(
                str(context.requirement.get("description") or ""),
                [item[2] for item in fetched_documents],
                min_kept=1,
                timeout_seconds=max(0.001, min(8.0, fallback_deadline - asyncio.get_running_loop().time())),
            )
            extraction_request = ExactSpanExtractionRequest(
                requirement_query=ExactSpanRequirementQuery(
                    requirement_id=str(context.requirement.get("id") or "requirement"),
                    requirement=str(context.requirement.get("description") or ""),
                    applies_when=context.applies_when,
                    query=context.discovery_query,
                ),
                documents=list(filtered_docs),
            )
            evidence_facts["stage"] = "extraction"
            try:
                extraction_deadline = min(
                    fallback_deadline,
                    asyncio.get_running_loop().time()
                    + _FALLBACK_EXTRACTION_SECONDS,
                )
                async with asyncio.timeout_at(extraction_deadline):
                    proposed = await self.extractor.extract(extraction_request)
                extraction = (
                    proposed
                    if isinstance(proposed, ExactSpanExtractionResult)
                    else ExactSpanExtractionResult.model_validate(proposed)
                )
            except TimeoutError:
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        status="fallback_deadline_exceeded",
                        extractor_usage_complete=False,
                        discovery_diagnostics=discovery_diagnostics,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=context.query_complete,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            except Exception as error:
                return finish_fallback(
                    _primary_with_failed_fallback(
                        primary,
                        extractor_usage_complete=False,
                        status=str(
                            getattr(error, "code", None) or "extraction_error"
                        ),
                        discovery_diagnostics=discovery_diagnostics,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=context.query_complete,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )

            def finish_extraction(result: dict[str, Any]) -> dict[str, Any]:
                return finish_fallback(
                    _with_uniform_model_version(
                        result,
                        primary.get("model_version"),
                        extraction.model_version,
                    )
                )

            logger.log(
                logging.WARNING if extraction.chosen_document is None else logging.INFO,
                "Workflow-v2 research fallback extraction completed; selected=%s "
                "fetched=%s incomplete_fetches=%s",
                extraction.chosen_document is not None,
                fetched_count,
                incomplete_fetch_count,
            )
            if extraction.chosen_document is None:
                evidence_facts["claim_count"] = 0
            if extraction.chosen_document is not None:
                selected = next(
                    (
                        item
                        for item in fetched_documents
                        if item[2].document_id
                        == extraction.chosen_document.document_id
                        and item[2] == extraction.chosen_document
                    ),
                    None,
                )
                if selected is None:
                    return finish_extraction(
                        _primary_with_failed_fallback(
                            primary,
                            status="extraction_document_mismatch",
                            discovery_diagnostics=discovery_diagnostics,
                            usage_input_tokens=extraction.input_tokens,
                            usage_output_tokens=extraction.output_tokens,
                            fetched_count=fetched_count,
                            fetch_error_count=fetch_error_count,
                            validation_incomplete_count=validation_incomplete_count,
                            query_complete=context.query_complete,
                            rejected_candidate_count=rejected_count,
                            malformed_candidate_count=malformed_count,
                            omitted_candidate_count=omitted_count,
                        )
                    )
                candidate, snapshot, _bounded_document = selected
                accepted_spans = _validated_extracted_spans(
                    snapshot.text, extraction
                )
                evidence_facts["claim_count"] = len(accepted_spans)
                if accepted_spans:
                    logger.info(
                        "Workflow-v2 research fallback completed; status=ok "
                        "candidates=%s fetched=%s claims=%s",
                        len(candidates),
                        fetched_count,
                        len(accepted_spans),
                    )
                    return finish_extraction(
                        _result_for_document(
                            primary=primary,
                            primary_status=primary_status,
                            discovery_status="ok",
                            candidate=candidate,
                            document=snapshot,
                            claims=accepted_spans,
                            candidate_count=len(candidates),
                            fetched_count=fetched_count,
                            query_complete=context.query_complete,
                            validation_incomplete_count=validation_incomplete_count,
                            rejected_candidate_count=rejected_count,
                            malformed_candidate_count=malformed_count,
                            omitted_candidate_count=omitted_count,
                            primary_diagnostics=primary_diagnostics,
                            discovery_diagnostics=discovery_diagnostics,
                            usage_input_tokens=extraction.input_tokens,
                            usage_output_tokens=extraction.output_tokens,
                        )
                    )
                return finish_extraction(
                    _primary_with_failed_fallback(
                        primary,
                        status="extraction_span_not_unique",
                        discovery_diagnostics=discovery_diagnostics,
                        usage_input_tokens=extraction.input_tokens,
                        usage_output_tokens=extraction.output_tokens,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=context.query_complete,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            if incomplete_fetch_count:
                return finish_extraction(
                    _primary_with_failed_fallback(
                        primary,
                        status="direct_fetch_incomplete",
                        discovery_diagnostics=discovery_diagnostics,
                        usage_input_tokens=extraction.input_tokens,
                        usage_output_tokens=extraction.output_tokens,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=context.query_complete,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            if not context.query_complete:
                return finish_extraction(
                    _primary_with_failed_fallback(
                        primary,
                        status="discovery_query_incomplete",
                        discovery_diagnostics=discovery_diagnostics,
                        usage_input_tokens=extraction.input_tokens,
                        usage_output_tokens=extraction.output_tokens,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=False,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            if rejected_count or malformed_count or omitted_count:
                return finish_extraction(
                    _primary_with_failed_fallback(
                        primary,
                        status="discovery_rows_incomplete",
                        discovery_diagnostics=discovery_diagnostics,
                        usage_input_tokens=extraction.input_tokens,
                        usage_output_tokens=extraction.output_tokens,
                        fetched_count=fetched_count,
                        fetch_error_count=fetch_error_count,
                        validation_incomplete_count=validation_incomplete_count,
                        query_complete=True,
                        rejected_candidate_count=rejected_count,
                        malformed_candidate_count=malformed_count,
                        omitted_candidate_count=omitted_count,
                    )
                )
            return finish_extraction(
                _empty_fallback_result(
                    primary=primary,
                    primary_status=primary_status,
                    candidate_count=len(candidates),
                    fetched_count=fetched_count,
                    query_complete=True,
                    validation_incomplete_count=validation_incomplete_count,
                    rejected_candidate_count=rejected_count,
                    malformed_candidate_count=malformed_count,
                    omitted_candidate_count=omitted_count,
                    primary_diagnostics=primary_diagnostics,
                    discovery_diagnostics=discovery_diagnostics,
                    usage_input_tokens=extraction.input_tokens,
                    usage_output_tokens=extraction.output_tokens,
                )
            )
        return finish_fallback(
            _empty_fallback_result(
                primary=primary,
                primary_status=primary_status,
                candidate_count=len(candidates),
                fetched_count=fetched_count,
                query_complete=context.query_complete,
                validation_incomplete_count=validation_incomplete_count,
                rejected_candidate_count=rejected_count,
                malformed_candidate_count=malformed_count,
                omitted_candidate_count=omitted_count,
                primary_diagnostics=primary_diagnostics,
                discovery_diagnostics=discovery_diagnostics,
            )
        )

    async def close(self) -> None:
        async with self._close_lock:
            async with self._lifecycle_condition:
                if self._closed:
                    return
                self._closing = True
            try:
                async with self._lifecycle_condition:
                    await self._lifecycle_condition.wait_for(
                        lambda: self._active_searches == 0
                    )
            except BaseException:
                await _await_cancellation_safe(
                    self._restore_open_after_close_cancel()
                )
                raise

            try:
                closers = []
                for component in (self.primary, self.searxng, self.extractor):
                    close = getattr(component, "close", None)
                    if close is None:
                        continue
                    value = close()
                    if inspect.isawaitable(value):
                        closers.append(value)
                if closers:
                    await asyncio.gather(*closers)
            finally:
                # Once component shutdown begins, the runner cannot safely be
                # reopened even if a closer fails or this close caller is cancelled.
                await _await_cancellation_safe(self._mark_closed_after_shutdown())


__all__ = [
    "DirectDocumentExtractor",
    "ResilientResearchRunner",
    "WORKFLOW_V2_FALLBACK_PHASE_SECONDS",
]
