"""Fail-closed quality contracts for grounded commercial research.

The validators in this module are deliberately jurisdiction agnostic.  They
operate on evidence returned by the configured retrieval providers and never
embed a country fact as production truth.  A country-specific value may appear
in a regression fixture, but the runtime must prove it from current evidence.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence
from urllib.parse import urlparse

import pycountry

from backend.services.research_source_authority_service import (
    validate_authority_claim_artifact,
    validate_authority_proof,
)


COMMERCIAL_MARKET_LAUNCH = "commercial_market_launch"
SUPPORTED_RESEARCH_PRD_TYPES = {
    COMMERCIAL_MARKET_LAUNCH,
    "operational_process",
    "product_strategy",
    "software_product",
}

_AUTHORITATIVE_SOURCE_TYPES = {"official_public", "official_registry", "academic"}
_PRIMARY_MARKET_SOURCE_TYPES = _AUTHORITATIVE_SOURCE_TYPES | {
    "official_company", "first_party_catalog", "recognized_industry_body"
}
_DIRECT_AUTHORITY_STATUSES = {
    "direct_domain_verified",
    "official_registry_verified",
    "official_domain_verified",
    "publisher_domain_verified",
}
_CRITICAL_TERMS = re.compile(
    r"\b(?:tax|vat|gst|duty|tariff|regulat(?:ion|ory)|licen[cs]e|legal|law|"
    r"compliance|ban|deadline|effective|price|cost|fee|margin|market size|"
    r"growth rate|population|sales|turnover|consumption|imports|exports|volume|"
    r"currency|exchange rate|minimum wage|quota)\b",
    re.IGNORECASE,
)
_REGULATORY_TERMS = re.compile(
    r"\b(?:tax|vat|gst|duty|tariff|regulat(?:ion|ory)|licen[cs]e|legal|law|"
    r"compliance|ban|minimum wage|quota)\b",
    re.IGNORECASE,
)
_STATISTICAL_TERMS = re.compile(
    r"\b(?:market size|population|growth rate|employment|inflation|exchange rate|"
    r"sales|turnover|consumption|imports|exports|volume)\b",
    re.IGNORECASE,
)
_COMMERCIAL_OBSERVATION_TERMS = re.compile(
    r"\b(?:price|cost|fee|retail|catalog|competitor|supplier|channel)\b",
    re.IGNORECASE,
)
_CLAIM_CLASS_APPLICABILITY_PATTERNS = {
    "statutory_current": re.compile(
        r"\b(?:tax|vat|gst|duty|tariff|customs|regulat(?:ion|ory)|licen[cs]e|"
        r"legal|law|compliance|gdpr|dsgvo|ban|minimum wage|quota)\b",
        re.IGNORECASE,
    ),
    "official_statistic": re.compile(
        r"\b(?:market(?: size| demand| research| assessment| opportunity| potential)?|"
        r"population|demograph(?:ic|ics|y)|growth|employment|inflation|"
        r"tam|sam|som|addressable market|icp)\b",
        re.IGNORECASE,
    ),
    "observed_primary_market": re.compile(
        r"\b(?:price|pricing|cost|fee|margin|unit economics|retail|catalog|"
        r"competitor|supplier|channel|package|sales|commercial|go[- ]to[- ]market|"
        r"gtm|market entry|launch)\b",
        re.IGNORECASE,
    ),
}
_ISO_CURRENCY_CODES = "|".join(
    sorted(re.escape(str(item.alpha_3)) for item in pycountry.currencies)
)
_CURRENCY_SYMBOLS = "€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾"
_MATERIAL_VALUE = re.compile(
    rf"(?<!\w)(?:(?:{_ISO_CURRENCY_CODES})\s*)?"
    rf"(?:[{re.escape(_CURRENCY_SYMBOLS)}]\s*)?-?\d[\d\s.,]*"
    rf"(?:\s*(?:%|percent|per\s+cent|{_ISO_CURRENCY_CODES}|euros?|dollars?|"
    rf"pounds?|yen|yuan|rupees?|million|billion|"
    rf"thousand|days?|months?|years?|[{re.escape(_CURRENCY_SYMBOLS)}]))?(?!\w)",
    re.IGNORECASE,
)
_TECHNICAL_KEY_PATTERN = re.compile(
    r"(?:^|_)(?:api|architecture|database|endpoint|latency|frontend|backend|"
    r"react|nextjs|next_js|state_machine|uptime)(?:$|_)",
    re.IGNORECASE,
)
_TECHNICAL_TEXT_PATTERN = re.compile(
    r"\b(?:REST API|API endpoint|React(?:\.js)?|Next\.js|database schema|"
    r"state machine|uptime SLA|p95 latency|microservice architecture)\b",
    re.IGNORECASE,
)
_FACT_STOP_WORDS = {
    "a", "an", "and", "as", "at", "be", "by", "current", "currently", "for",
    "from", "has", "in", "is", "it", "market", "of", "on", "rate", "standard",
    "that", "the", "this", "to", "was", "will", "with", "effective", "since",
}
_MONTH_WORDS = {
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
}
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def normalize_research_prd_type(value: Any, *, fallback: str = "operational_process") -> str:
    text = str(value or "").strip().casefold().replace("-", "_").replace(" ", "_")
    aliases = {
        "commercial_market_entry": COMMERCIAL_MARKET_LAUNCH,
        "commercial_launch": COMMERCIAL_MARKET_LAUNCH,
        "market_entry": COMMERCIAL_MARKET_LAUNCH,
        "commercial": COMMERCIAL_MARKET_LAUNCH,
        "operational": "operational_process",
        "technical": "software_product",
        "both": fallback,
    }
    normalized = aliases.get(text, text)
    return normalized if normalized in SUPPORTED_RESEARCH_PRD_TYPES else fallback


def determine_claim_class_applicability(
    goal_scope: Mapping[str, Any],
    requested_claim_classes: Iterable[str],
) -> Dict[str, Any]:
    """Derive claim-class applicability from the immutable goal contract.

    The decision is deterministic and is made before inspecting model output,
    so a retrieval or synthesis model cannot omit a difficult evidence class
    and thereby mark it not applicable.  Extracted material claims are merged
    into this decision later by :func:`evaluate_critical_claims`.
    """

    known = set(_CLAIM_CLASS_APPLICABILITY_PATTERNS)
    requested = {
        str(value).casefold() for value in requested_claim_classes if value
    } & known
    scope_text = " ".join(iter_semantic_text(goal_scope))
    semantic_type = normalize_research_prd_type(
        goal_scope.get("research_prd_type"), fallback="operational_process"
    )
    applicable: set[str] = set()
    reasons: Dict[str, str] = {}
    for evidence_class in sorted(requested):
        matched = bool(
            _CLAIM_CLASS_APPLICABILITY_PATTERNS[evidence_class].search(scope_text)
        )
        # A commercial launch always requires market/demand evidence and
        # observed pricing/channel/competitor evidence. Regulatory evidence is
        # required only when the goal itself introduces a legal/tax constraint.
        if semantic_type == COMMERCIAL_MARKET_LAUNCH and evidence_class in {
            "official_statistic",
            "observed_primary_market",
        }:
            matched = True
        if matched:
            applicable.add(evidence_class)
            reasons[evidence_class] = (
                "commercial_market_launch_contract"
                if semantic_type == COMMERCIAL_MARKET_LAUNCH
                and evidence_class in {"official_statistic", "observed_primary_market"}
                else "explicit_goal_scope_signal"
            )

    not_applicable = [
        {
            "evidence_class": evidence_class,
            "reason": "no_goal_scope_signal_for_evidence_class",
        }
        for evidence_class in sorted(requested - applicable)
    ]
    return {
        "requested_claim_classes": sorted(requested),
        "applicable_claim_classes": sorted(applicable),
        "applicability_reasons": reasons,
        "not_applicable_claim_classes": not_applicable,
    }


def iter_semantic_text(value: Any) -> Iterator[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, Mapping):
        for child in value.values():
            yield from iter_semantic_text(child)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for child in value:
            yield from iter_semantic_text(child)


def _semantic_nonempty(value: Any) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, Mapping):
        return bool(value) and any(_semantic_nonempty(item) for item in value.values())
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return bool(value) and any(_semantic_nonempty(item) for item in value)
    # Required commercial sections are structured research content.  Scalar
    # booleans/numbers are placeholders, not a semantically complete section.
    return False


def _iter_material_nodes(value: Any, path: str = "") -> Iterator[tuple[str, Mapping[str, Any]]]:
    if isinstance(value, Mapping):
        text = " ".join(
            f"{key} {child}"
            for key, child in value.items()
            if isinstance(child, (str, int, float)) and child not in ("", None)
        ).strip()
        if text and extract_material_facts(text, claim_id=path or "prd"):
            yield path or "commercial_prd", value
        for key, child in value.items():
            if key in {
                "claim",
                "statement",
                "value",
                "description",
                "text",
                "formula",
                "validation_plan",
            }:
                continue
            child_path = f"{path}.{key}" if path else str(key)
            yield from _iter_material_nodes(child, child_path)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, child in enumerate(value):
            yield from _iter_material_nodes(child, f"{path}[{index}]")
    elif isinstance(value, str) and extract_material_facts(
        value, claim_id=path or "prd"
    ):
        yield path or "commercial_prd", {"statement": value}


def _has_traceable_calculation(value: Any, verified_claim_ids: set[str]) -> bool:
    if isinstance(value, Mapping):
        formula = str(value.get("formula") or "").strip()
        inputs = {
            str(item) for item in value.get("input_claim_ids") or [] if item
        }
        if formula and inputs and inputs.issubset(verified_claim_ids):
            return True
        return any(
            _has_traceable_calculation(child, verified_claim_ids)
            for child in value.values()
        )
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return any(
            _has_traceable_calculation(child, verified_claim_ids)
            for child in value
        )
    return False


def _iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _normalized_value(value: str) -> str:
    return re.sub(r"\s+", "", value.casefold().replace(",", ".").rstrip(".,;:"))


def _material_unit(value: str) -> str:
    lowered = value.casefold()
    if "%" in value or "percent" in lowered or "per cent" in lowered:
        return "percent"
    if "€" in value or re.search(r"\bEUR\b", value, re.I):
        return "eur"
    if "$" in value or re.search(r"\bUSD\b", value, re.I):
        return "usd"
    if "£" in value or re.search(r"\bGBP\b", value, re.I):
        return "gbp"
    currency = re.search(rf"\b({_ISO_CURRENCY_CODES})\b", value, re.I)
    if currency:
        return currency.group(1).casefold()
    word_currency = re.search(r"\b(euros?|dollars?|pounds?|yen|yuan|rupees?)\b", lowered)
    if word_currency:
        return word_currency.group(1).rstrip("s")
    duration = re.search(r"\b(days?|months?|years?)\b", lowered)
    if duration:
        return duration.group(1).rstrip("s")
    scale = re.search(r"\b(million|billion|thousand)\b", lowered)
    return scale.group(1) if scale else "number"


def _metric_key(text: str, start: int, end: int, unit: str) -> str:
    """Bind a value to the nearest consequential metric, not just a word bag."""

    candidates = list(_CRITICAL_TERMS.finditer(text))
    if not candidates:
        return unit
    nearest = min(
        candidates,
        key=lambda item: min(abs(item.start() - end), abs(start - item.end())),
    )
    return f"{nearest.group(0).casefold()}:{unit}"


def _fact_terms(text: str, start: int, end: int) -> List[str]:
    window = text[max(0, start - 90): min(len(text), end + 90)].casefold()
    words = re.findall(r"[a-zà-ž][a-zà-ž0-9-]{2,}", window)
    return sorted(
        {
            word
            for word in words
            if word not in _FACT_STOP_WORDS
            and word not in _MONTH_WORDS
            and not re.fullmatch(r"\d{4}", word)
        }
    )[:32]


def extract_material_facts(
    text: str,
    *,
    claim_id: str = "",
    country_codes: Iterable[str] = (),
) -> List[Dict[str, Any]]:
    """Extract comparable material values without knowing a country in advance."""

    if not text or not _CRITICAL_TERMS.search(text):
        return []
    rows: List[Dict[str, Any]] = []
    for index, match in enumerate(_MATERIAL_VALUE.finditer(text)):
        raw = match.group(0).strip().rstrip(".,;:")
        if not raw:
            continue
        # Bare list ordinals and years are not independently useful facts.
        if not re.search(
            rf"[%{re.escape(_CURRENCY_SYMBOLS)}]|\b(?:percent|per\s+cent|"
            rf"{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?|yen|yuan|rupees?|"
            rf"million|billion|thousand|days?|months?|years?)\b",
            raw,
            re.I,
        ):
            if re.fullmatch(r"\d{1,4}", raw.replace(" ", "")):
                continue
        terms = _fact_terms(text, match.start(), match.end())
        if not terms:
            continue
        unit = _material_unit(raw)
        rows.append(
            {
                "fact_id": f"{claim_id or 'claim'}:fact:{index}",
                "claim_id": claim_id,
                "fact_terms": terms,
                "metric_key": _metric_key(text, match.start(), match.end(), unit),
                "unit": unit,
                "normalized_value": _normalized_value(raw),
                "display_value": raw,
                "country_codes": sorted({str(code).upper() for code in country_codes if code}),
            }
        )
    return rows


def _terms_overlap(left: Sequence[str], right: Sequence[str]) -> float:
    left_set, right_set = set(left), set(right)
    return len(left_set & right_set) / max(1, min(len(left_set), len(right_set)))


def _same_fact(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    left_countries = set(left.get("country_codes") or [])
    right_countries = set(right.get("country_codes") or [])
    if left_countries and right_countries and left_countries.isdisjoint(right_countries):
        return False
    if left.get("unit") and right.get("unit") and left.get("unit") != right.get("unit"):
        return False
    if left.get("metric_key") and right.get("metric_key"):
        if left.get("metric_key") != right.get("metric_key"):
            return False
    return _terms_overlap(left.get("fact_terms") or [], right.get("fact_terms") or []) >= 0.6


def _is_provider_redirect(source: Mapping[str, Any]) -> bool:
    if source.get("provider_redirect") is True:
        return True
    host = (urlparse(str(source.get("url") or "")).hostname or "").casefold()
    return any(token in host for token in ("vertexaisearch.cloud.google.com", "googleusercontent.com"))


def _claim_evidence_class(claim: Mapping[str, Any], text: str) -> str:
    explicit = str(claim.get("evidence_class") or claim.get("claim_class") or "").casefold()
    aliases = {
        "regulatory": "statutory_current",
        "tax": "statutory_current",
        "statistical": "official_statistic",
        "observed": "observed_primary_market",
        "calculated": "traceable_calculation",
        "synthetic": "synthetic_hypothesis",
        "hypothesis": "synthetic_hypothesis",
    }
    if explicit:
        return aliases.get(explicit, explicit)
    verification = str(claim.get("verification_status") or "").casefold()
    if "synthetic" in verification or "hypothesis" in verification:
        return "synthetic_hypothesis"
    if claim.get("formula") or claim.get("input_claim_ids"):
        return "traceable_calculation"
    if _REGULATORY_TERMS.search(text):
        return "statutory_current"
    if _STATISTICAL_TERMS.search(text):
        return "official_statistic"
    if _COMMERCIAL_OBSERVATION_TERMS.search(text):
        return "observed_primary_market"
    return "source_linked_observation"


def _evidence_time(
    claim: Mapping[str, Any],
    sources: Sequence[Mapping[str, Any]],
    evidence_class: str,
) -> Optional[datetime]:
    if evidence_class == "statutory_current":
        keys = ("effective_at", "as_of", "published_at")
    elif evidence_class == "official_statistic":
        keys = ("observation_end", "as_of", "published_at")
    elif evidence_class in {"observed_primary_market", "source_linked_observation"}:
        keys = ("observed_at", "as_of", "published_at")
    else:
        return None
    for owner in (claim, *sources):
        for key in keys:
            parsed = _iso_datetime(owner.get(key))
            if parsed:
                return parsed
    return None


def _fact_is_current(
    claim: Mapping[str, Any],
    evidence_time: Optional[datetime],
    evidence_class: str,
    *,
    now: datetime,
    freshness_days: int,
    freshness_by_class: Optional[Mapping[str, int]] = None,
) -> bool:
    if not evidence_time or evidence_time > now:
        return False
    expires_at = _iso_datetime(claim.get("expires_at"))
    if expires_at and expires_at < now:
        return False
    if evidence_class == "statutory_current":
        # An effective law/rate remains current until a supplied expiry or a
        # newer conflicting current claim supersedes it. Retrieval freshness is
        # checked separately; age alone does not make legislation stale.
        return claim.get("current") is True or expires_at is not None
    class_days = int(
        (freshness_by_class or {}).get(evidence_class)
        or (730 if evidence_class == "official_statistic" else freshness_days)
    )
    if evidence_class == "official_statistic" and claim.get("latest_release") is not True:
        return False
    return (now - evidence_time).days <= max(1, class_days)


def _has_exact_span_provenance(
    claim: Mapping[str, Any],
    claim_text: str,
    *,
    linked_sources: Sequence[Mapping[str, Any]] = (),
    require_direct_authority_document: bool = False,
) -> bool:
    """Verify the cited span against the retained immutable provider artifact."""

    provider_hash = str(claim.get("provider_response_hash") or "").casefold()
    citation = claim.get("citation_metadata")
    artifact = claim.get("provenance_artifact")
    if (
        not isinstance(citation, Mapping)
        or not isinstance(artifact, Mapping)
    ):
        return False
    start = citation.get("segment_start")
    end = citation.get("segment_end")
    target = str(citation.get("span_target") or "")
    artifact_type = str(artifact.get("artifact_type") or "")
    if target == "direct_authority_document":
        source_id = str(citation.get("source_id") or artifact.get("source_id") or "")
        source = next(
            (
                value
                for value in linked_sources
                if str(value.get("source_id") or "") == source_id
            ),
            None,
        )
        if not isinstance(source, Mapping):
            return False
        return bool(
            artifact_type == "direct_authority_document"
            and citation.get("offset_unit") == "unicode_codepoints"
            and validate_authority_claim_artifact(
                source, artifact, citation, claim_text
            )
        )
    if require_direct_authority_document:
        return False
    if not _SHA256.fullmatch(provider_hash):
        return False
    artifact_text = artifact.get("text")
    artifact_hash = str(artifact.get("sha256") or "").casefold()
    if (
        not isinstance(start, int)
        or not isinstance(end, int)
        or start < 0
        or end <= start
        or target != artifact_type
        or not isinstance(artifact_text, str)
        or not _SHA256.fullmatch(artifact_hash)
        or hashlib.sha256(artifact_text.encode("utf-8")).hexdigest() != artifact_hash
    ):
        return False
    offset_unit = str(citation.get("offset_unit") or "unicode_codepoints")
    if artifact_type == "provider_response_text" and artifact_hash != provider_hash:
        return False
    if artifact_type == "provider_response_part":
        if citation.get("part_index") != artifact.get("part_index"):
            return False
        if offset_unit != "utf8_bytes":
            return False
        part_hashes = artifact.get("response_part_hashes")
        response_parts = artifact.get("response_parts")
        response_text = artifact.get("provider_response_text")
        manifest_hash = str(artifact.get("response_parts_sha256") or "")
        if (
            not isinstance(part_hashes, list)
            or not isinstance(response_parts, list)
            or not all(isinstance(value, str) for value in response_parts)
            or len(part_hashes) != len(response_parts)
            or not isinstance(citation.get("part_index"), int)
            or citation["part_index"] >= len(part_hashes)
            or part_hashes[citation["part_index"]] != artifact_hash
            or not all(isinstance(value, str) and _SHA256.fullmatch(value) for value in part_hashes)
            or [hashlib.sha256(value.encode("utf-8")).hexdigest() for value in response_parts]
            != part_hashes
            or hashlib.sha256("\n".join(part_hashes).encode("ascii")).hexdigest()
            != manifest_hash
            or not isinstance(response_text, str)
            or "".join(response_parts) != response_text
            or hashlib.sha256(response_text.encode("utf-8")).hexdigest()
            != provider_hash
            or artifact.get("provider_response_sha256") != provider_hash
        ):
            return False
    if offset_unit == "utf8_bytes":
        encoded = artifact_text.encode("utf-8")
        if end > len(encoded):
            return False
        try:
            return encoded[start:end].decode("utf-8") == claim_text
        except UnicodeDecodeError:
            return False
    if end > len(artifact_text):
        return False
    return artifact_text[start:end] == claim_text


def evaluate_critical_claims(
    grounding: Dict[str, Any],
    country_codes: Iterable[str],
    *,
    now: Optional[datetime] = None,
    freshness_days: int = 120,
    freshness_by_class: Optional[Mapping[str, int]] = None,
    mandatory_claim_classes: Iterable[str] = (),
    claim_class_applicability: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Validate material claims against dated, jurisdiction-matched evidence.

    Official authority is accepted only for a direct publisher/registry URL.  A
    Gemini redirect remains useful provenance, but cannot by itself verify a
    consequential current fact.  Conflicting values remain separate records and
    block the contract rather than being resolved by model preference.
    """

    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    requested_countries = {str(code).upper() for code in country_codes if code}
    sources = {
        str(row.get("source_id")): row
        for row in grounding.get("market_sources") or []
        if isinstance(row, dict) and row.get("source_id")
    }
    critical_rows: List[Dict[str, Any]] = []
    blocked: List[Dict[str, str]] = []

    for claim in grounding.get("market_claims") or []:
        if not isinstance(claim, dict):
            continue
        text = " ".join(
            str(claim.get(key) or "")
            for key in ("subject", "predicate", "object", "display_text", "text")
        ).strip()
        critical_marker = claim.get("critical")
        critical = critical_marker is True or (
            critical_marker is not False and bool(_CRITICAL_TERMS.search(text))
        )
        if not critical:
            continue
        claim_id = str(claim.get("claim_id") or "")
        evidence_class = _claim_evidence_class(claim, text)
        claim_countries = {
            str(code).upper() for code in (claim.get("country_codes") or []) if code
        } or set(requested_countries)
        linked_sources = [sources[source_id] for source_id in claim.get("source_ids") or [] if source_id in sources]
        valid_authorities: List[Dict[str, Any]] = []
        direct_authorities: List[Dict[str, Any]] = []
        stale_sources: List[str] = []
        evidence_time = _evidence_time(claim, linked_sources, evidence_class)
        evidence_is_current = _fact_is_current(
            claim,
            evidence_time,
            evidence_class,
            now=now,
            freshness_days=freshness_days,
            freshness_by_class=freshness_by_class,
        )
        for source in linked_sources:
            source_countries = {
                str(code).upper() for code in (source.get("country_codes") or []) if code
            }
            jurisdiction_matches = (
                not requested_countries
                or bool(source_countries and requested_countries & source_countries)
            )
            authority = str(source.get("source_authority") or "")
            direct = bool(
                not _is_provider_redirect(source)
                and (
                    validate_authority_proof(
                        source, requested_country_codes=requested_countries
                    )
                    if authority in {"official_public", "first_party_catalog"}
                    else (
                        authority == "official_registry"
                        and source.get("provider") == "openregister"
                        and source.get("registry")
                        and source.get("provider_source_id")
                    )
                )
            )
            retrieved = _iso_datetime(source.get("retrieved_at"))
            fresh = bool(retrieved and (now - retrieved).days <= max(1, freshness_days))
            if retrieved and not fresh:
                stale_sources.append(str(source.get("source_id") or ""))
            permitted_authorities = (
                _PRIMARY_MARKET_SOURCE_TYPES
                if evidence_class in {"observed_primary_market", "source_linked_observation"}
                else _AUTHORITATIVE_SOURCE_TYPES
            )
            if (
                jurisdiction_matches
                and authority in permitted_authorities
                and direct
                and fresh
            ):
                direct_authorities.append(source)
                if evidence_is_current:
                    valid_authorities.append(source)

        facts = extract_material_facts(text, claim_id=claim_id, country_codes=claim_countries)
        exact_provenance = _has_exact_span_provenance(
            claim,
            str(claim.get("object") or claim.get("text") or ""),
            linked_sources=linked_sources,
            require_direct_authority_document=evidence_class
            in {
                "statutory_current",
                "official_statistic",
                "observed_primary_market",
            },
        )
        if evidence_class == "traceable_calculation":
            input_claim_ids = [str(value) for value in claim.get("input_claim_ids") or [] if value]
            formula = str(claim.get("formula") or "").strip()
            calculated = bool(formula and input_claim_ids)
            status = "verified_traceable_calculation" if calculated else "blocked_unverified"
        elif evidence_class == "synthetic_hypothesis":
            status = "hypothesis_not_observed"
        else:
            status = "verified_current_authoritative" if valid_authorities else "blocked_unverified"
        reason = None
        if evidence_class == "synthetic_hypothesis" and claim.get("critical") is not True:
            reason = None
        elif evidence_class == "traceable_calculation" and status != "verified_traceable_calculation":
            reason = "calculation_inputs_or_formula_missing"
        elif not facts:
            reason = "material_fact_not_extractable"
        elif not linked_sources:
            reason = "source_link_missing"
        elif not direct_authorities:
            reason = "current_direct_authoritative_source_missing"
        elif not exact_provenance and evidence_class not in {"traceable_calculation"}:
            reason = "exact_claim_span_provenance_missing"
        elif evidence_class not in {"traceable_calculation", "synthetic_hypothesis"} and not evidence_time:
            reason = "fact_effective_or_observation_date_missing"
        elif evidence_class not in {"traceable_calculation", "synthetic_hypothesis"} and not evidence_is_current:
            reason = "fact_effective_or_observation_date_stale"
        elif stale_sources and not valid_authorities:
            reason = "authoritative_source_stale"
        row = {
            "claim_id": claim_id,
            "status": status,
            "evidence_class": evidence_class,
            "country_codes": sorted(claim_countries),
            "source_ids": [str(source.get("source_id")) for source in linked_sources],
            "authoritative_source_ids": [str(source.get("source_id")) for source in valid_authorities],
            "facts": facts,
            "effective_or_observation_at": (
                evidence_time.isoformat() if evidence_time else None
            ),
        }
        critical_rows.append(row)
        if reason:
            blocked.append({"claim_id": claim_id, "reason": reason})

    verified_claim_ids = {
        row["claim_id"]
        for row in critical_rows
        if row["status"] == "verified_current_authoritative"
    }
    for row in critical_rows:
        if row["evidence_class"] != "traceable_calculation":
            continue
        claim = next(
            (
                item
                for item in grounding.get("market_claims") or []
                if isinstance(item, dict)
                and str(item.get("claim_id") or "") == row["claim_id"]
            ),
            {},
        )
        inputs = {str(value) for value in claim.get("input_claim_ids") or [] if value}
        if not inputs or not inputs.issubset(verified_claim_ids):
            row["status"] = "blocked_unverified"
            blocked.append(
                {
                    "claim_id": row["claim_id"],
                    "reason": "calculation_inputs_not_verified",
                }
            )
        else:
            verified_claim_ids.add(row["claim_id"])

    verified_facts = [
        fact
        for row in critical_rows
        if row["status"] in {"verified_current_authoritative", "verified_traceable_calculation"}
        for fact in row["facts"]
    ]
    conflicts: List[Dict[str, Any]] = []
    all_facts = [fact for row in critical_rows for fact in row["facts"]]
    for index, left in enumerate(all_facts):
        for right in all_facts[index + 1:]:
            # A claim may legitimately contain multiple values (for example a
            # rate and an effective date). Conflicts are comparisons between
            # independently sourced assertions of the same typed metric.
            if left.get("claim_id") and left.get("claim_id") == right.get("claim_id"):
                continue
            if _same_fact(left, right) and left["normalized_value"] != right["normalized_value"]:
                conflict = {
                    "left_fact_id": left["fact_id"],
                    "right_fact_id": right["fact_id"],
                    "values": [left["display_value"], right["display_value"]],
                }
                conflicts.append(conflict)
    if conflicts:
        blocked.extend(
            {"claim_id": row["left_fact_id"], "reason": "conflicting_material_values"}
            for row in conflicts
        )

    requested_classes = {
        str(value).casefold() for value in mandatory_claim_classes if value
    }
    known_grounding_classes = {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }
    requested_classes &= known_grounding_classes
    extracted_applicable_classes = {
        row["evidence_class"]
        for row in critical_rows
        if row["evidence_class"] in requested_classes
    }
    goal_applicable_classes = {
        str(value).casefold()
        for value in (
            (claim_class_applicability or {}).get("applicable_claim_classes") or []
        )
        if value
    } & requested_classes
    # Every actual material class is applicable, even if it was not anticipated
    # by the goal classifier. Conversely, goal-required classes remain required
    # even if retrieval/model output omits them.
    applicable_classes = extracted_applicable_classes | goal_applicable_classes
    not_applicable_classes = sorted(requested_classes - applicable_classes)
    required_classes = applicable_classes
    verified_classes = {
        row["evidence_class"]
        for row in critical_rows
        if row["status"] in {
            "verified_current_authoritative",
            "verified_traceable_calculation",
        }
    }
    for missing_class in sorted(required_classes - verified_classes):
        blocked.append(
            {
                "claim_id": "",
                "reason": f"mandatory_claim_class_missing:{missing_class}",
            }
        )

    status = "passed" if critical_rows and not blocked else "blocked"
    if not critical_rows:
        blocked.append({"claim_id": "", "reason": "no_material_critical_claims_identified"})
    evidence_ledger = [
        {
            "claim_id": row["claim_id"],
            "evidence_class": row["evidence_class"],
            "status": row["status"],
            "country_codes": row["country_codes"],
            "source_ids": row["authoritative_source_ids"],
            "effective_or_observation_at": row.get("effective_or_observation_at"),
            "facts": row["facts"],
            "sources": [
                {
                    "source_id": source_id,
                    "url": sources[source_id].get("url"),
                    "publisher": sources[source_id].get("publisher"),
                    "retrieved_at": sources[source_id].get("retrieved_at"),
                    "source_authority": sources[source_id].get("source_authority"),
                    "authority_proof_signature": (
                        (sources[source_id].get("authority_proof") or {}).get(
                            "proof_signature"
                        )
                    ),
                }
                for source_id in row["authoritative_source_ids"]
                if source_id in sources
            ],
        }
        for row in critical_rows
        if row["status"] in {
            "verified_current_authoritative",
            "verified_traceable_calculation",
        }
    ]
    return {
        "status": status,
        "total_count": len(critical_rows),
        "verified_count": sum(
            row["status"] in {"verified_current_authoritative", "verified_traceable_calculation"}
            for row in critical_rows
        ),
        "blocked_count": len(blocked),
        "conflict_count": len(conflicts),
        "stale_count": sum(row["reason"] == "authoritative_source_stale" for row in blocked),
        "claims": critical_rows,
        "verified_facts": verified_facts,
        "conflicts": conflicts,
        "blocked_claims": blocked,
        "mandatory_claim_classes": sorted(required_classes),
        "requested_claim_classes": sorted(requested_classes),
        "applicable_claim_classes": sorted(applicable_classes),
        "not_applicable_claim_classes": [
            {
                "evidence_class": value,
                "reason": next(
                    (
                        str(item.get("reason"))
                        for item in (
                            (claim_class_applicability or {}).get(
                                "not_applicable_claim_classes"
                            )
                            or []
                        )
                        if isinstance(item, Mapping)
                        and item.get("evidence_class") == value
                        and item.get("reason")
                    ),
                    "no_material_claim_or_goal_scope_signal_for_evidence_class",
                ),
            }
            for value in not_applicable_classes
        ],
        "applicability_reasons": {
            value: str(reason)
            for value, reason in (
                (claim_class_applicability or {}).get("applicability_reasons")
                or {}
            ).items()
            if value in applicable_classes and reason
        },
        "verified_claim_classes": sorted(verified_classes),
        "evidence_ledger": evidence_ledger,
    }


def validate_research_prd(
    content: Dict[str, Any],
    *,
    prd_type: str,
    critical_claim_quality: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Validate document intent and contradictions against verified evidence."""

    issues: List[Dict[str, str]] = []
    semantic_type = normalize_research_prd_type(prd_type)
    if semantic_type == COMMERCIAL_MARKET_LAUNCH:
        commercial = content.get("commercial_prd")
        if not isinstance(commercial, dict):
            issues.append({"code": "commercial_prd_missing", "message": "Commercial PRD section is required."})
        else:
            required = {
                "market_scope", "market_and_demand_assessment", "customer_segments",
                "buying_roles", "regulatory_checklist", "competitors",
                "suppliers_and_channels", "pricing_and_unit_economics",
                "go_to_market_plan_90_days", "risks_assumptions_and_validation",
            }
            for key in sorted(required - set(commercial)):
                issues.append({"code": "commercial_section_missing", "message": f"Required section missing: {key}"})
            for key in sorted(required & set(commercial)):
                if not _semantic_nonempty(commercial.get(key)):
                    issues.append(
                        {
                            "code": "commercial_section_empty",
                            "message": f"Required section is empty: {key}",
                        }
                    )
        for key in content:
            if _TECHNICAL_KEY_PATTERN.search(str(key)) or key == "technical_prd":
                issues.append({"code": "technical_scope_drift", "message": f"Unexpected technical section: {key}"})
        if any(_TECHNICAL_TEXT_PATTERN.search(text) for text in iter_semantic_text(content)):
            issues.append({"code": "technical_scope_drift", "message": "Software architecture was not requested."})

    quality = critical_claim_quality or {}
    if semantic_type == COMMERCIAL_MARKET_LAUNCH and quality.get("status") != "passed":
        issues.append({"code": "critical_claims_unverified", "message": "Current material market claims are unresolved."})

    verified = list(quality.get("verified_facts") or [])
    verified_claim_ids = {
        str(row.get("claim_id"))
        for row in quality.get("evidence_ledger") or []
        if isinstance(row, Mapping) and row.get("claim_id")
    }
    if semantic_type == COMMERCIAL_MARKET_LAUNCH and isinstance(
        content.get("commercial_prd"), Mapping
    ):
        for path, node in _iter_material_nodes(content["commercial_prd"]):
            cited = {
                str(value) for value in node.get("claim_ids") or [] if value
            }
            formula = str(node.get("formula") or "").strip()
            inputs = {
                str(value) for value in node.get("input_claim_ids") or [] if value
            }
            hypothesis = str(
                node.get("evidence_class") or node.get("claim_type") or ""
            ).casefold() == "synthetic_hypothesis"
            validation_plan = _semantic_nonempty(node.get("validation_plan"))
            traceable = bool(
                (cited and cited.issubset(verified_claim_ids))
                or (formula and inputs and inputs.issubset(verified_claim_ids))
                or (hypothesis and validation_plan)
            )
            if not traceable:
                issues.append(
                    {
                        "code": "material_fact_unlinked",
                        "message": (
                            f"Material value at {path} must cite verified claim_ids, "
                            "use a formula with verified input_claim_ids, or be a "
                            "synthetic_hypothesis with a validation_plan."
                        ),
                    }
                )
        pricing = content["commercial_prd"].get("pricing_and_unit_economics")
        if not _has_traceable_calculation(pricing, verified_claim_ids):
            issues.append(
                {
                    "code": "traceable_unit_economics_missing",
                    "message": (
                        "Pricing and unit economics must contain at least one formula "
                        "whose input_claim_ids are verified evidence ledger claims."
                    ),
                }
            )
    # Parse each semantic leaf independently. Concatenating an entire document
    # makes an otherwise precise claim inherit unrelated section vocabulary and
    # can hide a contradiction through arbitrary token-window truncation.
    document_facts = [
        fact
        for leaf_index, leaf in enumerate(iter_semantic_text(content))
        for fact in extract_material_facts(
            leaf,
            claim_id=f"research_prd:leaf:{leaf_index}",
        )
    ]
    for candidate in document_facts:
        for fact in verified:
            if _same_fact(candidate, fact) and candidate["normalized_value"] != fact["normalized_value"]:
                issues.append(
                    {
                        "code": "critical_fact_conflict",
                        "message": (
                            f"Document value {candidate['display_value']} conflicts with verified "
                            f"evidence value {fact['display_value']}."
                        ),
                    }
                )

    unique = list({(row["code"], row["message"]): row for row in issues}.values())
    return {
        "status": "passed" if not unique else "blocked",
        "prd_type": semantic_type,
        "issue_count": len(unique),
        "issues": unique,
    }


def prune_nulls(value: Any) -> Any:
    """Remove null members without changing quoted evidence text or offsets."""

    if isinstance(value, list):
        return [prune_nulls(item) for item in value if item is not None]
    if isinstance(value, dict):
        return {str(key): prune_nulls(item) for key, item in value.items() if item is not None}
    return value


def clean_semantic_text(value: Any) -> Any:
    """Remove presentation markup/null placeholders from non-evidence fields."""

    if isinstance(value, str):
        cleaned = value.replace("**", "").replace("\\_", "_")
        cleaned = re.sub(r"```(?:[a-zA-Z0-9_-]+)?|```", "", cleaned)
        cleaned = re.sub(r"\\(?:\(|\[)|\\(?:\)|\])", "", cleaned)
        cleaned = re.sub(r"(?<!\\)\$([^$\n]+)\$", r"\1", cleaned)
        cleaned = re.sub(r"\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}", r"\1", cleaned)
        cleaned = re.sub(r"^\s*#{1,6}\s+", "", cleaned)
        cleaned = cleaned.replace("[object Object]", "").replace("[object object]", "")
        if cleaned.strip().casefold() in {"null", "none", "undefined"}:
            return ""
        cleaned = re.sub(r"^\s*[-*•]\s+", "", cleaned)
        return " ".join(cleaned.replace("\x00", " ").split())
    if isinstance(value, list):
        return [clean_semantic_text(item) for item in value if item is not None]
    if isinstance(value, dict):
        return {str(key): clean_semantic_text(item) for key, item in value.items() if item is not None}
    return value
