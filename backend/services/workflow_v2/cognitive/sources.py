"""Research source classification, catalogue/claim binding and usage provenance."""

from __future__ import annotations
import hashlib
import re
from backend.domain.workflow_v2.contracts import (
    EvidenceClaimV1,
    EvidenceRequirement,
    ResearchSourceV1,
    canonical_hash,
    is_canonical_public_https_url,
    utf16_ordinal_sorted,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from backend.services.workflow_v2.cognitive.policy import (
    _MAX_REUSABLE_SOURCE_CANDIDATES,
    _OFFICIAL_SOURCE_CLASSES_BY_HOST,
)
from backend.services.workflow_v2.cognitive.scope import (
    _explicit_eu_regulation_identities,
    _explicit_eu_regulation_url_identities,
    _has_explicit_enumeration_mismatch,
    _requirement_has_statutory_force,
)


def _normalized_source_type(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")


def _classify_source_types(url: str, _title: str) -> set[str]:
    parsed = urlparse(url)
    host = (parsed.hostname or "").casefold()
    path = (parsed.path or "").casefold()
    host_and_path = f"{host} {path}"
    types = {"grounded_web"}
    for authority_host, authority_types in _OFFICIAL_SOURCE_CLASSES_BY_HOST.items():
        if host == authority_host or host.endswith(f".{authority_host}"):
            types.update(authority_types)
    generic_government_host = bool(
        host.endswith(".gov")
        or re.search(r"(?:^|\.)gov\.[a-z]{2,3}$", host)
        or host == "europa.eu"
        or host.endswith(".europa.eu")
    )
    government_host = generic_government_host or "government" in types
    if government_host:
        types.add("government")
    if (
        "primary_law" in types
        or host == "eur-lex.europa.eu"
        or (
            generic_government_host
            and any(
                marker in host_and_path
                for marker in ("legislation", "legal", "law", "regulation", "statute")
            )
        )
    ):
        types.add("primary_law")
    if (
        host.endswith(".edu")
        or re.search(r"(?:^|\.)ac\.[a-z]{2,3}$", host)
        or host == "doi.org"
        or host.endswith(".doi.org")
    ):
        types.add("academic")
    if government_host and any(
        marker in host_and_path
        for marker in ("statistics", "statistik", "eurostat", "census")
    ):
        types.add("official_statistics")
    if host in {"iso.org", "www.iso.org", "iec.ch", "www.iec.ch"}:
        types.add("standard")
    # ``industry`` has no globally reliable hostname convention. Titles and
    # arbitrary hostname substrings are publisher-controlled, so neither can
    # establish that authority class. Industry-only evidence must therefore be
    # supplied as selected immutable evidence whose class is already bound, or
    # remain an explicit evidence gap.
    return types


def _classify_source_record(url: str, raw_source: dict[str, Any]) -> set[str]:
    """Classify a source without trusting fallback discovery metadata.

    SearX titles are untrusted locators and can contain arbitrary organization
    labels.  They remain useful for display, but must not elevate an unrelated
    public host into the accepted ``industry`` evidence class.
    """

    return _classify_source_types(url, str(raw_source.get("title") or ""))


def _canonical_retrieval_date(value: Any) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    utc = parsed.astimezone(timezone.utc)
    rendered = utc.isoformat(timespec="microseconds").replace("+00:00", "Z")
    return rendered.replace(".000000Z", "Z")


def _source_snapshot(
    raw_source: dict[str, Any], claim_ids: list[str]
) -> ResearchSourceV1 | None:
    title = str(raw_source.get("title") or "").strip()
    url = str(raw_source.get("url") or "").strip()
    retrieval_date = _canonical_retrieval_date(raw_source.get("retrieved_at"))
    if not title or title.casefold() == "unknown" or retrieval_date is None:
        return None
    source_classes = utf16_ordinal_sorted(_classify_source_record(url, raw_source))
    core = {
        "canonicalUrl": url,
        "retrievalDate": retrieval_date,
        "sourceClasses": source_classes,
        "sourceTitle": title[:1000],
    }
    try:
        return ResearchSourceV1(
            source_id=canonical_hash(core),
            source_title=core["sourceTitle"],
            canonical_url=url,
            source_classes=source_classes,
            retrieval_date=retrieval_date,
            supported_claim_ids=utf16_ordinal_sorted(set(claim_ids)),
        )
    except ValueError:
        return None


@dataclass(frozen=True)
class _ResearchSourceLocator:
    """An untrusted operation-local URL hint that can never become evidence itself."""

    canonical_url: str
    source_title: str
    source_classes: tuple[str, ...]


def _source_locator(raw_source: dict[str, Any]) -> _ResearchSourceLocator | None:
    title = str(raw_source.get("title") or "").strip()
    url = str(raw_source.get("url") or "").strip()
    if (
        not title
        or title.casefold() == "unknown"
        or len(title) > 1_000
        or not is_canonical_public_https_url(url)
    ):
        return None
    return _ResearchSourceLocator(
        canonical_url=url,
        source_title=title,
        source_classes=tuple(
            utf16_ordinal_sorted(_classify_source_record(url, raw_source))
        ),
    )


def _claims_with_source_catalogue(
    claims: list[EvidenceClaimV1], sources: list[dict[str, Any]]
) -> tuple[list[EvidenceClaimV1], list[ResearchSourceV1]]:
    source_by_url = {
        str(item.get("url") or ""): item
        for item in sources
        if isinstance(item, dict) and item.get("url")
    }
    valid_claims: list[EvidenceClaimV1] = []
    supported_by_url: dict[str, list[str]] = {}
    for claim in claims:
        if any(
            _source_snapshot(source_by_url.get(url, {}), [claim.claim_id]) is None
            for url in claim.source_urls
        ):
            continue
        valid_claims.append(claim)
        for url in claim.source_urls:
            supported_by_url.setdefault(url, []).append(claim.claim_id)
    catalogue = [
        snapshot
        for url in utf16_ordinal_sorted(supported_by_url)
        if (snapshot := _source_snapshot(source_by_url[url], supported_by_url[url]))
        is not None
    ]
    return valid_claims, sorted(catalogue, key=lambda source: source.source_id)


def _merge_source_catalogue(
    catalogues: list[list[ResearchSourceV1]],
) -> list[ResearchSourceV1]:
    by_id: dict[str, ResearchSourceV1] = {}
    for source in (item for catalogue in catalogues for item in catalogue):
        prior = by_id.get(source.source_id)
        if prior is None:
            by_id[source.source_id] = source
            continue
        if prior.model_dump(
            mode="json", by_alias=True, exclude={"supported_claim_ids"}
        ) != (
            source.model_dump(
                mode="json", by_alias=True, exclude={"supported_claim_ids"}
            )
        ):
            raise CognitiveExecutionFailure(
                "AXWISE_RESEARCH_SOURCE_CONFLICT", retryable=False
            )
        by_id[source.source_id] = prior.model_copy(
            update={
                "supported_claim_ids": utf16_ordinal_sorted(
                    set(prior.supported_claim_ids).union(source.supported_claim_ids)
                )
            }
        )
    return [by_id[source_id] for source_id in utf16_ordinal_sorted(by_id)]


def _repair_source_candidates(
    requirement: EvidenceRequirement,
    catalogues: list[list[ResearchSourceV1]],
    locator_catalogues: list[list[_ResearchSourceLocator]] | None = None,
) -> list[dict[str, str]]:
    """Reuse only authoritative public locators acquired in this operation.

    These rows remain locators, never evidence: the resilient runner must fetch
    each publisher document again and the exact-span extractor must select a
    byte-verifiable passage.  Broad ``grounded_web`` overlap cannot crowd out a
    more specific source class during a targeted repair pass.
    """

    accepted_types = {
        _normalized_source_type(value) for value in requirement.accepted_source_types
    }
    specific_types = accepted_types.difference({"grounded_web"})
    required_overlap = specific_types or accepted_types
    allowed_hosts = set(requirement.allowed_source_hosts)
    by_url: dict[str, dict[str, Any]] = {}

    def add_candidate(
        *,
        url: str,
        title: str,
        source_classes: set[str],
        supported_claim_ids: set[str],
        current_requirement_locator: bool,
    ) -> None:
        if len(url) > 1_000:
            return
        if not source_classes.intersection(required_overlap):
            return
        if allowed_hosts and not _url_matches_allowed_hosts(url, allowed_hosts):
            return
        row = by_url.setdefault(
            url,
            {
                "titles": set(),
                "supported_claim_ids": set(),
                "current_requirement_locator": False,
            },
        )
        row["titles"].add(title[:500])
        row["supported_claim_ids"].update(supported_claim_ids)
        row["current_requirement_locator"] = bool(
            row["current_requirement_locator"] or current_requirement_locator
        )

    for source in (item for catalogue in catalogues for item in catalogue):
        add_candidate(
            url=source.canonical_url,
            title=source.source_title,
            source_classes={
                _normalized_source_type(value) for value in source.source_classes
            },
            supported_claim_ids=set(source.supported_claim_ids),
            current_requirement_locator=False,
        )
    for source in (
        item for catalogue in (locator_catalogues or []) for item in catalogue
    ):
        add_candidate(
            url=source.canonical_url,
            title=source.source_title,
            source_classes={
                _normalized_source_type(value) for value in source.source_classes
            },
            supported_claim_ids=set(),
            current_requirement_locator=True,
        )

    def direct_text_rank(url: str) -> int:
        path = urlparse(url).path.casefold()
        if path.endswith((".html", ".htm")) or "/html/" in path:
            return 0
        if "/eli/" in path or path.endswith((".txt", ".xml", ".json")):
            return 1
        return 2

    def document_number_tokens(url: str) -> set[int]:
        values = {int(value) for value in re.findall(r"\d+", url)}
        return {value for value in values if value >= 100 and not 1900 <= value <= 2100}

    def rank_group(
        candidates: list[tuple[str, dict[str, Any]]],
    ) -> list[tuple[str, dict[str, Any]]]:
        ranked = sorted(
            candidates,
            key=lambda item: (
                direct_text_rank(item[0]),
                -len(item[1]["supported_claim_ids"]),
                item[0].encode("utf-16-be"),
            ),
        )
        selected = ranked[:1]
        if selected:
            preferred_numbers = document_number_tokens(selected[0][0])
            selected.extend(
                item
                for item in ranked[1:]
                if preferred_numbers.intersection(document_number_tokens(item[0]))
            )
        selected_urls = {url for url, _row in selected}
        selected.extend(item for item in ranked if item[0] not in selected_urls)
        return selected

    # The locator catalogue is scoped to this exact requirement. Preserve its
    # opportunity to reach the direct-fetch runner before global same-operation
    # sources consume the three-candidate cap; global sources still fill every
    # remaining slot. URLs present in both groups inherit locator priority.
    current_requirement_locators = rank_group(
        [item for item in by_url.items() if item[1]["current_requirement_locator"]]
    )
    global_sources = rank_group(
        [item for item in by_url.items() if not item[1]["current_requirement_locator"]]
    )
    selected = [*current_requirement_locators, *global_sources]
    return [
        {
            "url": url,
            "title": utf16_ordinal_sorted(row["titles"])[0],
        }
        for url, row in selected[:_MAX_REUSABLE_SOURCE_CANDIDATES]
    ]


def _claim_from_grounding(
    raw_claim: dict[str, Any],
    source_by_url: dict[str, dict[str, Any]],
    accepted_source_types: set[str],
    allowed_source_hosts: set[str],
    expected_response_hash: str,
    provider_response_text: str,
    *,
    requirement: EvidenceRequirement | None = None,
    provider: str | None = None,
) -> EvidenceClaimV1 | None:
    text = raw_claim.get("text")
    urls = [str(value) for value in raw_claim.get("source_urls", []) if value]
    if not isinstance(text, str) or not text.strip() or not urls:
        return None
    if _has_explicit_enumeration_mismatch(text):
        return None
    if requirement is not None:
        expected_instruments = _explicit_eu_regulation_identities(
            requirement.description
        )
        claim_instruments = _explicit_eu_regulation_identities(text)
        source_instruments = set().union(
            *(_explicit_eu_regulation_url_identities(url) for url in urls)
        )
        if len(expected_instruments) == 1 and (
            bool(claim_instruments - expected_instruments)
            or bool(source_instruments - expected_instruments)
        ):
            return None
        if (
            claim_instruments
            and source_instruments
            and not (claim_instruments & source_instruments)
        ):
            return None
        claim_provider = str(provider or raw_claim.get("provider") or "")
        if (
            _requirement_has_statutory_force(requirement)
            and claim_provider != "searxng_direct_fetch"
        ):
            # Grounded provider prose and citations remain useful operation-local
            # locators, but they are not the publisher's legal text. Every statutory
            # assertion must therefore be refetched from the publisher and bound to an
            # exact immutable byte span before it can become evidence.
            return None
    if allowed_source_hosts and any(
        not _url_matches_allowed_hosts(url, allowed_source_hosts) for url in urls
    ):
        return None
    source_types: set[str] = set()
    for url in urls:
        source = source_by_url.get(url, {})
        url_source_types = _classify_source_record(url, source)
        if accepted_source_types and not url_source_types.intersection(
            accepted_source_types
        ):
            return None
        source_types.update(url_source_types)
    ordered_urls = utf16_ordinal_sorted(set(urls))
    ordered_types = utf16_ordinal_sorted(source_types)
    identity = canonical_hash(
        {"text": text, "sourceTypes": ordered_types, "sourceUrls": ordered_urls}
    )
    response_bytes = provider_response_text.encode("utf-8")
    claim_bytes = text.encode("utf-8")
    first = response_bytes.find(claim_bytes)
    second = response_bytes.find(claim_bytes, first + 1) if first >= 0 else -1
    if first < 0 or second >= 0:
        return None
    span_start = first
    span_end = first + len(claim_bytes)
    return EvidenceClaimV1(
        claim_id=identity,
        text=text,
        text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
        source_urls=ordered_urls,
        source_types=ordered_types,
        provider_response_hash=expected_response_hash,
        segment_start=span_start,
        segment_end=span_end,
        offset_unit="utf8_bytes",
    )


def _url_matches_allowed_hosts(url: str, allowed_hosts: set[str]) -> bool:
    try:
        host = (urlparse(url).hostname or "").casefold()
    except ValueError:
        return False
    return any(
        host == allowed or host.endswith(f".{allowed}") for allowed in allowed_hosts
    )


def _usage_from_search(result: dict[str, Any]) -> tuple[int, int, int, int]:
    usage = result.get("usage_metadata") or {}

    def first_optional_int(source: Any, *keys: str) -> int | None:
        if not isinstance(source, dict):
            return None
        for key in keys:
            value = source.get(key)
            if value is not None:
                try:
                    return max(0, int(value))
                except (TypeError, ValueError):
                    return None
        return None

    normalized_input = first_optional_int(usage, "input_tokens", "inputTokens")
    input_tokens = (
        normalized_input
        if normalized_input is not None
        else (first_optional_int(usage, "prompt_token_count", "promptTokenCount") or 0)
        + (
            first_optional_int(
                usage,
                "tool_use_prompt_token_count",
                "toolUsePromptTokenCount",
            )
            or 0
        )
    )
    normalized_output = first_optional_int(usage, "output_tokens", "outputTokens")
    output_tokens = (
        normalized_output
        if normalized_output is not None
        else (
            first_optional_int(usage, "candidates_token_count", "candidatesTokenCount")
            or 0
        )
        + (first_optional_int(usage, "thoughts_token_count", "thoughtsTokenCount") or 0)
    )
    reported_total = first_optional_int(
        usage,
        "total_tokens",
        "totalTokens",
        "total_token_count",
        "totalTokenCount",
    )
    if reported_total is not None:
        # Google bills thinking as output. Any reported non-input remainder is
        # therefore output even if a response shape omitted thoughtsTokenCount.
        output_tokens = max(output_tokens, max(0, reported_total - input_tokens))
    total_tokens = max(reported_total or 0, input_tokens + output_tokens)
    provider_queries = result.get("provider_queries")
    search_query_count = (
        len(provider_queries) if isinstance(provider_queries, list) else 0
    )
    return (
        input_tokens,
        output_tokens,
        total_tokens,
        search_query_count,
    )


def _model_version_from_search(result: dict[str, Any]) -> str | None:
    value = result.get("model_version", result.get("modelVersion"))
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized or len(normalized) > 200:
        return None
    return normalized


def _uniform_model_version(values: list[str | None]) -> str | None:
    if not values or values[0] is None:
        return None
    first = values[0]
    return first if all(value == first for value in values) else None
