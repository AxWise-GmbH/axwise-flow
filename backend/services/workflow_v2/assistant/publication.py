"""Shared Assistant evidence admission before repair and before publication."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from backend.domain.workflow_v2.contracts import (
    is_canonical_public_https_url,
    utf16_ordinal_sorted,
)
from backend.services.workflow_v2.assistant.answer_quality import (
    assistant_claim_source_matches,
    assistant_claim_statement_context,
)
from backend.services.workflow_v2.assistant.citations import (
    normalize_assistant_citation_claims,
    prose_link_destinations,
    render_assistant_citations,
)
from backend.services.workflow_v2.assistant.source_policy import (
    AssistantSourcePolicy,
    assistant_source_policy_from_payload,
)


@dataclass(frozen=True)
class AssistantPublication:
    markdown: str
    sources: list[dict[str, Any]]
    claims: list[dict[str, Any]]
    issues: tuple[str, ...]


def source_policy_from_query(query: str) -> AssistantSourcePolicy:
    """Read only the first server-owned canonical request, never provider output."""
    try:
        request = json.loads(query.partition("\n")[0])
    except (TypeError, ValueError):
        return AssistantSourcePolicy()
    if not isinstance(request, dict) or "sourcePolicy" not in request:
        return AssistantSourcePolicy()
    if not isinstance(request.get("instruction"), str) or not isinstance(
        request.get("message"), str
    ):
        raise ValueError("Source policy requires a canonical Assistant request")
    return assistant_source_policy_from_payload(request["sourcePolicy"])


def assistant_source_url_allowed(query: str, url: str) -> bool:
    try:
        return source_policy_from_query(query).allows_url(url)
    except (TypeError, ValueError):
        return False


def assess_assistant_publication(
    raw: dict[str, Any],
    policy: AssistantSourcePolicy,
) -> AssistantPublication:
    """Produce a separate view; never relabel or edit the provider evidence ledger."""
    text = str(raw.get("text") or "")
    issues: list[str] = []
    if not policy.resolved:
        issues.append("source_policy_unresolved")
    all_sources: dict[str, dict[str, Any]] = {}
    raw_sources = raw.get("sources")
    for source in (raw_sources if isinstance(raw_sources, list) else [])[:10]:
        if not isinstance(source, dict):
            continue
        url = source.get("url")
        if isinstance(url, str) and is_canonical_public_https_url(url):
            all_sources.setdefault(url, source)
    sources = {
        url: source for url, source in all_sources.items() if policy.allows_url(url)
    }
    if policy.mode == "restricted":
        original_claims = raw.get("claims")
        for claim in (original_claims if isinstance(original_claims, list) else [])[
            :50
        ]:
            if not isinstance(claim, dict) or not isinstance(
                claim.get("source_urls"), list
            ):
                continue
            if any(
                isinstance(url, str) and not policy.allows_url(url)
                for url in claim["source_urls"]
            ):
                issues.append("source_policy_violation")
                break
        try:
            prose_urls = prose_link_destinations(text)
        except ValueError:
            # Reader-parser limits or malformed content are publication defects,
            # never a reason to bypass the source constraint or mark an outage.
            issues.append("invalid_citation_response")
            prose_urls = ()
        if any(not policy.allows_url(url) for url in prose_urls):
            issues.append("source_policy_violation")
    claims: list[dict[str, Any]] = []
    for claim in normalize_assistant_citation_claims(raw):
        statement = str(claim.get("text") or "")
        contextual = assistant_claim_statement_context(statement, claim)
        known_urls = [url for url in claim["source_urls"] if url in sources]
        urls = utf16_ordinal_sorted(
            {
                url
                for url in known_urls
                if assistant_claim_source_matches(
                    contextual, url, str(sources[url].get("title") or "")
                )
            }
        )
        if known_urls and not urls:
            issues.append("source_component_mismatch")
        if statement.strip() and urls:
            claims.append({**claim, "source_urls": urls})
    if not claims:
        issues.append("assistant_evidence_missing")
    rendering = render_assistant_citations(
        raw,
        admitted_claims=claims,
        admitted_source_urls=sources,
    )
    issues.extend(rendering.issues)
    return AssistantPublication(
        markdown=rendering.markdown,
        sources=[sources[url] for url in utf16_ordinal_sorted(sources)],
        claims=claims,
        issues=tuple(dict.fromkeys(issues)),
    )


def assistant_parsed_response_defects(
    query: str, raw: dict[str, Any]
) -> tuple[str, ...]:
    # Preserve existing normalization/unavailability failure status and fallback
    # routing. A missing SDK response is not a publication-policy configuration bug.
    if raw.get("search_performed") is False:
        return ()
    return assess_assistant_publication(raw, source_policy_from_query(query)).issues


__all__ = [
    "AssistantPublication",
    "assess_assistant_publication",
    "assistant_parsed_response_defects",
    "assistant_source_url_allowed",
    "source_policy_from_query",
]
