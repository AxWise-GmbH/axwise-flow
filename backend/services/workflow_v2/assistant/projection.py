"""Fail-closed projection of provider results into AssistantTurnV1."""

from __future__ import annotations

import hashlib
import re
from typing import Any, Literal

from backend.domain.workflow_v2.contracts import (
    AssistantFactV1,
    AssistantRecommendationV1,
    AssistantSourceV1,
    AssistantTurnCompletedResult,
    AssistantTurnV1,
    is_canonical_public_https_url,
    utf16_ordinal_sorted,
)
from backend.services.workflow_v2.assistant.protocols import (
    MetricsFactory,
    SourceTypeClassifier,
    UsageReader,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure


WORKFLOW_V2_ASSISTANT_FALLBACK_FACT_CHARACTERS = 4_000
WORKFLOW_V2_ASSISTANT_FALLBACK_MARKDOWN_CHARACTERS = 80_000


def _model_version(raw: dict[str, Any]) -> str | None:
    value = raw.get("model_version", raw.get("modelVersion"))
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > 200:
        return None
    return normalized


def assistant_fallback_markdown(
    raw: dict[str, Any],
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]]] | None:
    """Render only byte-verified direct-fetch claims, never the fetched document."""

    diagnostics = raw.get("runtime_diagnostics")
    if (
        raw.get("provider") != "searxng_direct_fetch"
        or not isinstance(diagnostics, dict)
        or diagnostics.get("route") != "searxng_direct_fetch"
        or diagnostics.get("fallback_used") is not True
    ):
        return None
    document = raw.get("text")
    response_hash = raw.get("provider_response_hash")
    if (
        not isinstance(document, str)
        or not document
        or not isinstance(response_hash, str)
        or not re.fullmatch(r"[0-9a-f]{64}", response_hash)
        or hashlib.sha256(document.encode("utf-8")).hexdigest() != response_hash
    ):
        return None

    sources_by_url: dict[str, dict[str, Any]] = {}
    raw_sources = raw.get("sources")
    if not isinstance(raw_sources, list):
        return None
    for source in raw_sources[:10]:
        if not isinstance(source, dict):
            continue
        url = source.get("url")
        if (
            not isinstance(url, str)
            or not is_canonical_public_https_url(url)
            or source.get("provider") != "searxng_direct_fetch"
            or source.get("provider_response_hash") != response_hash
        ):
            continue
        sources_by_url.setdefault(url, source)
    if not sources_by_url:
        return None

    document_bytes = document.encode("utf-8")
    verified_claims: list[dict[str, Any]] = []
    seen_claims: set[tuple[str, tuple[str, ...]]] = set()
    raw_claims = raw.get("claims")
    if not isinstance(raw_claims, list):
        return None
    for claim in raw_claims[:50]:
        if not isinstance(claim, dict):
            continue
        text = claim.get("text")
        urls = claim.get("source_urls")
        start = claim.get("segment_start")
        end = claim.get("segment_end")
        if (
            not isinstance(text, str)
            or not text
            or not text.strip()
            or len(text) > WORKFLOW_V2_ASSISTANT_FALLBACK_FACT_CHARACTERS
            or not isinstance(urls, list)
            or not urls
            or any(
                not isinstance(url, str) or url not in sources_by_url for url in urls
            )
            or claim.get("provider") != "searxng_direct_fetch"
            or claim.get("provider_response_hash") != response_hash
            or claim.get("offset_unit") != "utf8_bytes"
            or claim.get("span_target") != "provider_response_text"
            or not isinstance(start, int)
            or isinstance(start, bool)
            or not isinstance(end, int)
            or isinstance(end, bool)
            or start < 0
            or end <= start
            or end > len(document_bytes)
        ):
            continue
        try:
            exact = document_bytes[start:end].decode("utf-8")
        except UnicodeDecodeError:
            continue
        if exact != text:
            continue
        normalized_urls = utf16_ordinal_sorted(set(urls))
        if len(normalized_urls) > 10:
            continue
        identity = (text, tuple(normalized_urls))
        if identity in seen_claims:
            continue
        seen_claims.add(identity)
        verified_claims.append({**claim, "source_urls": normalized_urls})
    if not verified_claims:
        return None

    def quoted(value: str) -> str:
        escaped = value.replace("\\", "\\\\")
        for marker in ("`", "*", "_", "[", "]", "<", ">"):
            escaped = escaped.replace(marker, f"\\{marker}")
        return "\n".join(f"> {line}" if line else ">" for line in escaped.splitlines())

    lines = [
        "## Grounded fallback evidence",
        "",
        (
            "The primary grounded-research provider was unavailable. AxWise "
            "independently fetched publisher sources and verified these exact passages:"
        ),
    ]
    footer = [
        "",
        (
            "This is a bounded evidence fallback, not a complete synthesis. "
            "Retry the grounded request when the primary provider is available "
            "for a full researched answer."
        ),
    ]
    claims: list[dict[str, Any]] = []
    for claim in verified_claims:
        block = [
            "",
            f"### Evidence {len(claims) + 1}",
            "",
            quoted(str(claim["text"])),
            "",
            "Source: " + ", ".join(f"<{url}>" for url in claim["source_urls"]),
        ]
        candidate_markdown = "\n".join([*lines, *block, *footer])
        if len(candidate_markdown) > WORKFLOW_V2_ASSISTANT_FALLBACK_MARKDOWN_CHARACTERS:
            continue
        lines.extend(block)
        claims.append(claim)
    if not claims:
        return None
    lines.extend(footer)
    selected_urls = {url for claim in claims for url in claim["source_urls"]}
    return (
        "\n".join(lines),
        [sources_by_url[url] for url in utf16_ordinal_sorted(selected_urls)],
        claims,
    )


def project_assistant_result(
    raw: dict[str, Any],
    *,
    response_mode: Literal["direct_answer", "discover", "one_shot"],
    source_type_classifier: SourceTypeClassifier,
    usage_reader: UsageReader,
    metrics_factory: MetricsFactory,
) -> AssistantTurnCompletedResult:
    raw_sources = raw.get("sources", [])
    raw_claims = raw.get("claims", [])
    fallback = assistant_fallback_markdown(raw)
    verified_fallback = fallback is not None
    if raw.get("provider") == "searxng_direct_fetch":
        if fallback is None:
            markdown = ""
            raw_sources = []
            raw_claims = []
        else:
            markdown, raw_sources, raw_claims = fallback
    else:
        markdown = str(raw.get("text") or "").strip()
    if not markdown:
        runtime_diagnostics = raw.get("runtime_diagnostics")
        status = str(
            runtime_diagnostics.get("status")
            if isinstance(runtime_diagnostics, dict)
            else ""
        )
        raise CognitiveExecutionFailure(
            "AXWISE_ASSISTANT_EMPTY_RESPONSE",
            retryable=status
            in {
                "deadline_exceeded",
                "retry_exhausted",
                "unavailable",
                "response_processing_error",
            },
            diagnostics=(
                runtime_diagnostics
                if isinstance(runtime_diagnostics, dict)
                else None
            ),
        )
    sources_by_url: dict[str, AssistantSourceV1] = {}
    for raw_source in raw_sources[:10]:
        if not isinstance(raw_source, dict):
            continue
        url = str(raw_source.get("url") or "")
        if not is_canonical_public_https_url(url):
            continue
        title = str(raw_source.get("title") or url)[:500]
        source_types = utf16_ordinal_sorted(source_type_classifier(url, title))
        sources_by_url.setdefault(
            url,
            AssistantSourceV1(
                title=title,
                canonical_url=url,
                source_types=source_types,
            ),
        )
    facts: list[AssistantFactV1] = []
    seen_facts: set[tuple[str, tuple[str, ...]]] = set()
    for raw_claim in raw_claims[:50]:
        if not isinstance(raw_claim, dict):
            continue
        raw_statement = raw_claim.get("text")
        statement = (
            raw_statement
            if verified_fallback and isinstance(raw_statement, str)
            else str(raw_statement or "").strip()
        )
        urls = utf16_ordinal_sorted(
            {
                str(value)
                for value in raw_claim.get("source_urls", [])
                if str(value) in sources_by_url
            }
        )
        identity = (statement, tuple(urls))
        if not statement or not urls or identity in seen_facts:
            continue
        seen_facts.add(identity)
        facts.append(
            AssistantFactV1(
                statement=(statement if verified_fallback else statement[:4000]),
                source_urls=urls,
            )
        )
    input_tokens, output_tokens, _total_tokens, search_calls = usage_reader(raw)
    recommendation = AssistantRecommendationV1(
        kind="continue_conversation",
        summary=(
            "Answer the material clarification and continue here."
            if response_mode == "discover"
            else "Continue in Assistant unless the work becomes dependent or long-running."
        ),
    )
    metric_values: dict[str, Any] = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "search_calls": search_calls,
    }
    model_version = _model_version(raw)
    if model_version is not None:
        metric_values["model_version"] = model_version
    return AssistantTurnCompletedResult(
        result_type="assistant_turn_completed",
        response=AssistantTurnV1(
            schema_version="axwise.assistant-turn.v1",
            markdown=markdown,
            sources=[
                sources_by_url[url] for url in utf16_ordinal_sorted(sources_by_url)
            ],
            facts=facts,
            recommendations=[recommendation],
        ),
        metrics=metrics_factory(**metric_values),
    )


__all__ = [
    "WORKFLOW_V2_ASSISTANT_FALLBACK_FACT_CHARACTERS",
    "WORKFLOW_V2_ASSISTANT_FALLBACK_MARKDOWN_CHARACTERS",
    "assistant_fallback_markdown",
    "project_assistant_result",
]
