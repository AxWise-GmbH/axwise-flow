"""Fail-closed quality contracts for grounded commercial research.

The validators in this module are deliberately jurisdiction agnostic.  They
operate on evidence returned by the configured retrieval providers and never
embed a country fact as production truth.  A country-specific value may appear
in a regression fixture, but the runtime must prove it from current evidence.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence
from urllib.parse import urlparse

import pycountry

from backend.services.research_source_authority_service import (
    _commercial_offer_evidence,
    _structured_statistical_observations,
    claim_matching_offer_evidence,
    fact_matching_offer_evidence,
    validate_authority_claim_artifact,
    validate_authority_proof,
    validate_structured_statistical_claim_artifact,
)
from backend.services.research_topic_contract_service import (
    TopicSeedContract,
    exact_topic_phrase_in_visible_text,
    match_visible_statistical_topic,
    product_topic_phrases,
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
    r"sales|turnover|consumption|imports|exports|volume|price\s+index|"
    r"consumer\s+price\s+index|producer\s+price\s+index|cpi|ppi)\b",
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
    rf"(?:[{re.escape(_CURRENCY_SYMBOLS)}]\s*)?"
    rf"-?(?:\d{{1,3}}(?:[ \u00a0,]\d{{3}})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)"
    rf"(?:\s*(?:%|percent|per\s+cent|{_ISO_CURRENCY_CODES}|euros?|dollars?|"
    rf"pounds?|yen|yuan|rupees?|million|billion|"
    rf"thousand|days?|months?|years?|[{re.escape(_CURRENCY_SYMBOLS)}]))?(?!\w)",
    re.IGNORECASE,
)
_STATUTORY_MATERIAL_UNIT = re.compile(
    rf"[%{re.escape(_CURRENCY_SYMBOLS)}]|\b(?:percent|per\s+cent|"
    rf"{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?|yen|yuan|rupees?|"
    r"days?|months?|years?)\b",
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


def _normalized_value(value: str, unit: str = "") -> str:
    """Normalize equivalent spellings without guessing a measurement scale."""

    lowered = value.casefold().strip().rstrip(".,;:")
    lowered = re.sub(r"\b(?:percent|per\s+cent)\b", "%", lowered)
    lowered = re.sub(
        rf"\b(?:{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?)\b",
        "",
        lowered,
        flags=re.IGNORECASE,
    )
    lowered = re.sub(rf"[{re.escape(_CURRENCY_SYMBOLS)}%]", "", lowered)
    scale_match = re.search(r"\b(thousand|million|billion)\b", lowered)
    lowered = re.sub(r"\b(?:thousand|million|billion)\b", "", lowered)
    lowered = re.sub(r"\s+", "", lowered)
    if re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?", lowered):
        lowered = lowered.replace(",", "")
    # A single comma followed by one or two digits is a decimal separator.
    elif re.fullmatch(r"-?\d+,\d{1,2}", lowered):
        lowered = lowered.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(?:[,. ]\d{3})+", lowered):
        lowered = re.sub(r"[,. ]", "", lowered)
    if scale_match:
        multiplier = {
            "thousand": Decimal("1000"),
            "million": Decimal("1000000"),
            "billion": Decimal("1000000000"),
        }[scale_match.group(1)]
        try:
            lowered = format(Decimal(lowered) * multiplier, "f")
            if "." in lowered:
                lowered = lowered.rstrip("0").rstrip(".")
        except InvalidOperation:
            pass
    return f"{lowered}:{unit}" if unit else lowered


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
        return {
            "euro": "eur",
            "dollar": "usd",
            "pound": "gbp",
        }.get(word_currency.group(1).rstrip("s"), word_currency.group(1).rstrip("s"))
    duration = re.search(r"\b(days?|months?|years?)\b", lowered)
    if duration:
        return duration.group(1).rstrip("s")
    return "number"


def _structured_statistical_facts(
    claim: Mapping[str, Any],
    linked_sources: Sequence[Mapping[str, Any]],
    *,
    claim_id: str,
    country_codes: Iterable[str],
    topic_seed_contract: Optional[Mapping[str, Any]] = None,
) -> List[Dict[str, Any]]:
    observation = claim.get("structured_statistical_observation")
    if not isinstance(observation, Mapping):
        return []
    unsigned = {
        str(key): value
        for key, value in observation.items()
        if key != "observation_sha256"
    }
    expected_hash = hashlib.sha256(
        json.dumps(
            unsigned,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    ).hexdigest()
    if observation.get("observation_sha256") != expected_hash:
        return []
    requested_countries = {
        str(value).upper() for value in country_codes if value
    }
    reporter_code = str(observation.get("reporter_code") or "").upper()
    if reporter_code and (
        len(requested_countries) != 1
        or reporter_code not in requested_countries
    ):
        return []
    independently_derived: Optional[Mapping[str, Any]] = None
    for source in linked_sources:
        proof = source.get("authority_proof")
        authority_document = source.get("_authority_document_artifact")
        raw_html = source.get("_structured_evidence_html")
        if not isinstance(proof, Mapping):
            continue
        if not isinstance(authority_document, Mapping):
            continue
        direct_text = authority_document.get("text")
        direct_hash = str((proof.get("direct") or {}).get("content_sha256") or "")
        if (
            not isinstance(direct_text, str)
            or len(direct_text.encode("utf-8")) > 100_000
            or hashlib.sha256(direct_text.encode("utf-8")).hexdigest() != direct_hash
            or authority_document.get("sha256") != direct_hash
        ):
            continue
        if (
            not isinstance(raw_html, str)
            or not raw_html
            or len(raw_html.encode("utf-8")) > 2_000_000
            or hashlib.sha256(raw_html.encode("utf-8")).hexdigest()
            != proof.get("structured_evidence_source_sha256")
        ):
            continue
        derived = _structured_statistical_observations(raw_html)
        # The proof's canonical manifest and the individual claim must both be
        # independently reproduced from the exact private fetched bytes.
        if (
            list(proof.get("structured_statistical_observations") or []) == derived
            and observation in derived
        ):
            independently_derived = observation
        if independently_derived:
            break
    if not independently_derived:
        return []
    topic_match = None
    if topic_seed_contract:
        try:
            topic_seed = TopicSeedContract.model_validate(topic_seed_contract)
            topic_country = next(
                iter(sorted({str(value).upper() for value in country_codes if value})),
                "",
            )
            topic_match = match_visible_statistical_topic(
                topic_seed,
                {
                    "title": observation.get("table_title") or "",
                    "series": [observation.get("series") or ""],
                },
                country_code=topic_country,
                source_anchors=product_topic_phrases(topic_seed),
            )
        except (TypeError, ValueError):
            return []
        if not topic_match.matched:
            return []
    public_claim_text = str(
        observation.get("canonical_claim_text")
        or observation.get("row_text")
        or ""
    )
    if public_claim_text != str(claim.get("object") or claim.get("text") or ""):
        return []
    series = str(observation.get("series") or "").strip()
    period = str(observation.get("observation_end") or "").strip()
    dataset_id = str(observation.get("dataset_id") or "").strip()
    table_id = str(observation.get("table_id") or "").strip()
    display_value = " ".join(
        value
        for value in (
            str(observation.get("value") or "").strip(),
            str(observation.get("unit") or "").strip(),
        )
        if value
    )
    if not series or not period or not display_value or not (dataset_id or table_id):
        return []
    cell_text = str(observation.get("cell_text") or "").strip()
    column_index = str(observation.get("column_index") or "")
    row_cells = observation.get("row_cells")
    period_label = str(observation.get("period") or "").strip()
    artifact_text = str(
        ((claim.get("provenance_artifact") or {}).get("text") or "")
    )
    if (
        not cell_text
        or not column_index.isdigit()
        or not isinstance(row_cells, list)
        or int(column_index) >= len(row_cells)
        or str(row_cells[int(column_index)]).strip() != cell_text
        or (
            not observation.get("canonical_claim_text")
            and cell_text not in str(observation.get("row_text") or "")
        )
        or str(observation.get("value") or "").strip() not in cell_text
        or not period_label
        or period_label.casefold() not in artifact_text.casefold()
    ):
        return []
    unit = _material_unit(display_value)
    scope_text = f"{series} {display_value}"
    value_match = _MATERIAL_VALUE.search(display_value)
    if not value_match:
        return []
    source_scope = sorted(
        {str(value) for value in claim.get("source_ids") or [] if value}
    )
    countries = sorted(requested_countries)
    # The table parser supplies an explicit dataset/series/unit identity.  Do
    # not run it back through an English keyword heuristic: national portals
    # may use local-language or code-only series labels.
    structured_scope = (
        f"statistic:structured:dataset={dataset_id or table_id}:"
        f"series={series.casefold()}:unit={unit}"
    )
    identity_complete = bool(
        countries
        and source_scope
        and period
        and (dataset_id or table_id)
        and series
        and unit
    )
    return [
        {
            "fact_id": f"{claim_id}:fact:structured:0",
            "claim_id": claim_id,
            "fact_terms": _fact_terms(scope_text, value_match.start(), value_match.end()),
            "metric_key": f"{dataset_id or table_id}:{series.casefold()}:{unit}",
            "unit": unit,
            "normalized_value": _normalized_value(display_value, unit),
            "display_value": display_value,
            "country_codes": countries,
            "identity_version": "material_fact_v2",
            "evidence_class": "official_statistic",
            "temporal_scope": period,
            "source_scope": source_scope,
            "semantic_scope": structured_scope,
            "identity_complete": identity_complete,
            "structured_observation_sha256": expected_hash,
            "topic_match": (
                topic_match.model_dump(mode="json") if topic_match else None
            ),
        }
    ]


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
    words = re.findall(r"[^\W\d_][\w-]{2,}", window, re.UNICODE)
    pack_dimensions = [
        re.sub(r"\s+", "", match.group(0))
        for match in re.finditer(
            r"\b\d+(?:[.,]\d+)?\s*(?:kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            window,
        )
    ]
    return sorted(
        {
            word
            for word in [*words, *pack_dimensions]
            if word not in _FACT_STOP_WORDS
            and word not in _MONTH_WORDS
            and not re.fullmatch(r"\d{4}", word)
        }
    )[:32]


def _semantic_fact_scope(
    text: str,
    start: int,
    end: int,
    evidence_class: str,
) -> str:
    """Return only explicit dimensions that decide fact comparability.

    Missing dimensions remain empty; they are never invented from a country or
    provider. The scope complements (rather than replaces) exact source spans.
    """

    window = text[max(0, start - 140): min(len(text), end + 140)].casefold()
    if evidence_class == "statutory_current":
        # Statutory identity must come from the value's own clause.  Long CMS
        # pages often flatten navigation, update dates, contact details and
        # several tax tiers into one text stream; borrowing qualifiers from a
        # neighbouring clause made unrelated values look like the same law.
        left = max(
            (text.rfind(separator, 0, start) for separator in (".", ";", "\n", "|", "•")),
            default=-1,
        )
        right_candidates = [
            position
            for separator in (".", ";", "\n", "|", "•")
            if (position := text.find(separator, end)) >= 0
        ]
        right = min(right_candidates) if right_candidates else len(text)
        clause = text[left + 1:right].casefold().strip()
        if clause:
            window = clause[
                max(0, start - left - 1 - 180): min(
                    len(clause), end - left - 1 + 180
                )
            ]
        concepts = [
            label
            for label, pattern in (
                ("vat", r"\b(?:vat|value[- ]added\s+tax)\b"),
                ("gst", r"\bgst\b|\bgoods\s+and\s+services\s+tax\b"),
                ("duty", r"\b(?:duty|tariff|customs)\b"),
                ("tax", r"\btax\b"),
                ("minimum_wage", r"\bminimum\s+wage\b"),
            )
            if re.search(pattern, window)
        ]
        qualifiers = [
            label
            for label, pattern in (
                ("standard", r"\bstandard\b"),
                ("reduced", r"\breduced\b"),
                ("zero", r"\bzero(?:[- ]rated)?\b"),
                ("exempt", r"\bexempt(?:ion)?\b"),
                ("transitional", r"\btransitional\b"),
                ("product_specific", r"\b(?:food|medicine|books?|services?|goods?)\b"),
            )
            if re.search(pattern, window)
        ]
        return "statutory:" + ":".join(
            ["+".join(concepts) or "unspecified", "+".join(qualifiers) or "unqualified"]
        )
    if evidence_class == "official_statistic":
        concepts = [
            label
            for label, pattern in (
                ("population", r"\bpopulation\b"),
                ("turnover", r"\bturnover\b"),
                ("sales", r"\bsales\b"),
                ("imports", r"\bimports?\b"),
                ("exports", r"\bexports?\b"),
                ("consumption", r"\bconsumption\b"),
                ("employment", r"\bemployment\b"),
                ("price_index", r"\b(?:consumer|producer|construction|retail)?\s*price\s+index\b|\b(?:cpi|ppi)\b"),
            )
            if re.search(pattern, window)
        ]
        measure = (
            "index_level"
            if re.search(r"\b(?:price\s+index|cpi|ppi|index\s+points?|points?)\b", window)
            else "volume_index"
            if re.search(r"\bvolume(?:\s+index)?\b", window)
            else "monetary_value"
            if re.search(
                rf"\b(?:value|{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?)\b|"
                rf"[{re.escape(_CURRENCY_SYMBOLS)}]",
                window,
                re.I,
            )
            else "count"
        )
        dimensions = [
            label
            for label, pattern in (
                ("net", r"\bnet\b"),
                ("gross", r"\bgross\b"),
                ("retail", r"\bretail\b"),
                ("wholesale", r"\bwholesale\b"),
                ("total", r"\btotal\b"),
                ("per_capita", r"\bper\s+capita\b"),
                ("seasonally_adjusted", r"\bseasonally\s+adjusted\b"),
                ("unadjusted", r"\bunadjusted\b"),
            )
            if re.search(pattern, window)
        ]
        return "statistic:" + "+".join(
            [*(concepts or ["unspecified"]), measure, *(dimensions or ["all"])]
        )
    if evidence_class == "observed_primary_market":
        product_words = re.findall(
            r"[^\W\d_][\w-]{2,}", window, re.UNICODE
        )
        product_identity = [
            word
            for word in product_words
            if word not in _FACT_STOP_WORDS
            and word not in _MONTH_WORDS
            and not _COMMERCIAL_OBSERVATION_TERMS.fullmatch(word)
            and word
            not in {
                "current", "retail", "catalogue", "catalog", "product", "food",
                "brand", "price", "cost", "fee", "eur", "usd", "brl",
            }
        ]
        packs = [
            re.sub(r"\s+", "", match.group(0))
            for match in re.finditer(
                r"\b\d+(?:[.,]\d+)?\s*(?:kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
                window,
            )
        ]
        local_suffix = text[end: min(len(text), end + 24)].casefold()
        denominator_match = re.search(
            r"^\s*(?:/|\bper\s+)(kg|g|l|ml|pcs?|piece|unit|item)\b",
            local_suffix,
        )
        denominator = (
            f"per_{denominator_match.group(1).casefold()}"
            if denominator_match
            else "per_item"
        )
        price_basis = [
            label
            for label, pattern in (
                ("list", r"\b(?:list|regular) price\b"),
                ("promotion", r"\b(?:sale|promo(?:tional)?|discount(?:ed)?)\b"),
                ("member", r"\b(?:member|loyalty) price\b"),
                ("gross", r"\bgross\b"),
                ("net", r"\bnet\b"),
            )
            if re.search(pattern, window)
        ]
        identity_tokens = sorted(set([*product_identity, *packs]))
        return "catalog:" + ":".join(
            [
                "+".join(price_basis) or "stated_price",
                denominator,
                "+".join(identity_tokens),
            ]
        )
    return ""


def extract_material_facts(
    text: str,
    *,
    claim_id: str = "",
    country_codes: Iterable[str] = (),
    evidence_class: str = "",
    temporal_scope: str = "",
    source_scope: Iterable[str] = (),
) -> List[Dict[str, Any]]:
    """Extract comparable material values without knowing a country in advance."""

    explicit_material_class = evidence_class in {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }
    if not text or (not explicit_material_class and not _CRITICAL_TERMS.search(text)):
        return []
    rows: List[Dict[str, Any]] = []
    for index, match in enumerate(_MATERIAL_VALUE.finditer(text)):
        raw = match.group(0).strip().rstrip(".,;:")
        if not raw:
            continue
        if (
            evidence_class == "statutory_current"
            and not _STATUTORY_MATERIAL_UNIT.search(raw)
        ):
            # Dates, CMS update stamps, postcodes, registry numbers and phone
            # numbers are not material legal values merely because they occur
            # on a signed authority page.  A statutory fact needs an explicit
            # rate, amount or duration unit.
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
        if evidence_class == "observed_primary_market":
            # A typed catalogue observation may be entirely local-language;
            # currency is the locale-neutral material signal. Navigation/cart
            # placeholders are not a market price and cannot cover the class.
            if unit not in {"eur", "usd", "gbp"} and not re.search(
                rf"\b(?:{_ISO_CURRENCY_CODES})\b|[{re.escape(_CURRENCY_SYMBOLS)}]",
                raw,
                re.IGNORECASE,
            ):
                continue
            numeric = re.search(r"-?\d[\d\s.,]*", raw)
            try:
                numeric_value = Decimal(
                    re.sub(r"\s+", "", numeric.group(0)).replace(",", ".")
                ) if numeric else Decimal("0")
            except InvalidOperation:
                numeric_value = Decimal("0")
            local_context = text[
                max(0, match.start() - 80): min(len(text), match.end() + 80)
            ].casefold()
            if numeric_value <= 0 or re.search(
                r"\b(?:cart|basket|checkout|subtotal|shipping|quantity|filter)\b",
                local_context,
            ):
                continue
        semantic_scope = _semantic_fact_scope(
            text, match.start(), match.end(), evidence_class
        )
        normalized_sources = sorted({str(value) for value in source_scope if value})
        normalized_countries = sorted(
            {str(code).upper() for code in country_codes if code}
        )
        identity_complete = bool(
            evidence_class == "statutory_current"
            and temporal_scope
            and normalized_countries
            and not semantic_scope.startswith("statutory:unspecified:")
            or evidence_class == "official_statistic"
            and temporal_scope
            and normalized_countries
            and "unspecified" not in semantic_scope
            or evidence_class == "observed_primary_market"
            and temporal_scope
            and normalized_sources
            and len(terms) >= 3
        )
        rows.append(
            {
                "fact_id": f"{claim_id or 'claim'}:fact:{index}",
                "claim_id": claim_id,
                "fact_terms": terms,
                "metric_key": _metric_key(text, match.start(), match.end(), unit),
                "unit": unit,
                "normalized_value": _normalized_value(raw, unit),
                "display_value": raw,
                "country_codes": normalized_countries,
                "identity_version": "material_fact_v2",
                "evidence_class": str(evidence_class or ""),
                "temporal_scope": str(temporal_scope or ""),
                "source_scope": normalized_sources,
                "semantic_scope": semantic_scope,
                "identity_complete": identity_complete,
            }
        )
    # A flattened statistical table can carry several series/periods inside a
    # single claim-wide span. Without per-value span bindings, assigning the
    # claim's one period/scope to every number would invent target identity and
    # create false conflicts. Keep the candidates for diagnostics but make
    # them ineligible for coverage and conflict comparison.
    if evidence_class in {"official_statistic", "statutory_current"} and len(rows) > 1:
        for row in rows:
            row["identity_complete"] = False
            row["identity_incomplete_reason"] = (
                "ambiguous_multi_value_statistic_passage"
                if evidence_class == "official_statistic"
                else "ambiguous_multi_value_statutory_passage"
            )
    return rows


def _terms_overlap(left: Sequence[str], right: Sequence[str]) -> float:
    left_set, right_set = set(left), set(right)
    return len(left_set & right_set) / max(1, min(len(left_set), len(right_set)))


def _same_fact(left: Mapping[str, Any], right: Mapping[str, Any]) -> bool:
    if (
        left.get("identity_version") == "material_fact_v2"
        and right.get("identity_version") == "material_fact_v2"
        and not (left.get("identity_complete") and right.get("identity_complete"))
    ):
        return False
    left_countries = set(left.get("country_codes") or [])
    right_countries = set(right.get("country_codes") or [])
    if left_countries and right_countries and left_countries.isdisjoint(right_countries):
        return False
    if left.get("unit") and right.get("unit") and left.get("unit") != right.get("unit"):
        return False
    if left.get("metric_key") and right.get("metric_key"):
        if left.get("metric_key") != right.get("metric_key"):
            return False
    left_class = str(left.get("evidence_class") or "")
    right_class = str(right.get("evidence_class") or "")
    if left_class and right_class and left_class != right_class:
        return False

    left_period = str(left.get("temporal_scope") or "")
    right_period = str(right.get("temporal_scope") or "")
    if left_period and right_period and left_period != right_period:
        return False
    left_scope = str(left.get("semantic_scope") or "")
    right_scope = str(right.get("semantic_scope") or "")
    if left_scope and right_scope and left_scope != right_scope:
        return False

    left_sources = set(left.get("source_scope") or [])
    right_sources = set(right.get("source_scope") or [])
    if left_class == right_class == "observed_primary_market":
        # Prices from different sellers/catalogues are observations, not
        # contradictions. Within one catalogue require near-identical product
        # context so different SKUs, packs, variants and promotion rows remain
        # independent facts.
        if not left_sources or not right_sources or left_sources != right_sources:
            return False
        return bool(left_scope and right_scope and left_scope == right_scope)
    if (
        left.get("identity_version") == "material_fact_v2"
        and right.get("identity_version") == "material_fact_v2"
    ):
        # V2 facts are comparable only by the exact typed identity checked
        # above. Fuzzy word overlap is candidate discovery, not a safe fact ID.
        return bool(left_scope and right_scope and left_scope == right_scope)
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
    if target == "derived_structured_statistical_observation":
        source_id = str(citation.get("source_id") or artifact.get("source_id") or "")
        source = next(
            (
                value
                for value in linked_sources
                if str(value.get("source_id") or "") == source_id
            ),
            None,
        )
        observation = claim.get("structured_statistical_observation")
        return bool(
            isinstance(source, Mapping)
            and isinstance(observation, Mapping)
            and validate_structured_statistical_claim_artifact(
                source,
                artifact,
                citation,
                claim_text,
                observation,
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
    topic_seed_contract: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Validate material claims against dated, jurisdiction-matched evidence.

    Official authority is accepted only for a direct publisher/registry URL.  A
    Gemini redirect remains useful provenance, but cannot by itself verify a
    consequential current fact.  Conflicting values remain separate records and
    block the contract rather than being resolved by model preference.
    """

    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    requested_countries = {str(code).upper() for code in country_codes if code}
    requested_policy_classes = {
        str(value).casefold() for value in mandatory_claim_classes if value
    }
    applicable_policy_classes = {
        str(value).casefold()
        for value in (
            (claim_class_applicability or {}).get("applicable_claim_classes") or []
        )
        if value
    }
    official_topic_required = "official_statistic" in requested_policy_classes and (
        claim_class_applicability is None
        or "official_statistic" in applicable_policy_classes
    )
    observed_topic_required = (
        "observed_primary_market" in requested_policy_classes
        and (
            claim_class_applicability is None
            or "observed_primary_market" in applicable_policy_classes
        )
    )
    raw_topic_seed = topic_seed_contract or grounding.get("topic_seed_contract")
    validated_topic_seed: Optional[TopicSeedContract] = None
    topic_contract_status = "not_required"
    if official_topic_required or observed_topic_required:
        topic_contract_status = "missing_or_invalid"
        try:
            candidate_topic_seed = TopicSeedContract.model_validate(raw_topic_seed)
            if requested_countries and not requested_countries.issubset(
                set(candidate_topic_seed.confirmed_country_codes)
            ):
                raise ValueError("topic seed does not cover requested country cells")
            validated_topic_seed = candidate_topic_seed
            topic_contract_status = "valid"
        except (TypeError, ValueError):
            validated_topic_seed = None
    sources = {
        str(row.get("source_id")): row
        for row in grounding.get("market_sources") or []
        if isinstance(row, dict) and row.get("source_id")
    }
    critical_rows: List[Dict[str, Any]] = []
    candidate_failures: List[Dict[str, str]] = []

    for claim in grounding.get("market_claims") or []:
        if not isinstance(claim, dict):
            continue
        text = " ".join(
            str(claim.get(key) or "")
            for key in ("subject", "predicate", "object", "display_text", "text")
        ).strip()
        fact_text = str(
            claim.get("object")
            or claim.get("display_text")
            or claim.get("text")
            or ""
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
            proof_requested_countries = (
                requested_countries & claim_countries
                if requested_countries & claim_countries
                else claim_countries or requested_countries
            )
            direct = bool(
                not _is_provider_redirect(source)
                and (
                    validate_authority_proof(
                        source,
                        requested_country_codes=proof_requested_countries,
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

        temporal_scope = str(
            claim.get("observation_end")
            or claim.get("observed_at")
            or claim.get("effective_at")
            or claim.get("as_of")
            or ""
        )
        structured_official_statistic = isinstance(
            claim.get("structured_statistical_observation"), Mapping
        )
        facts = (
            _structured_statistical_facts(
                claim,
                linked_sources,
                claim_id=claim_id,
                country_codes=claim_countries,
                topic_seed_contract=(
                    validated_topic_seed.model_dump(mode="json")
                    if validated_topic_seed
                    else None
                ),
            )
            if evidence_class == "official_statistic"
            and structured_official_statistic
            and (not official_topic_required or validated_topic_seed is not None)
            else extract_material_facts(
                fact_text,
                claim_id=claim_id,
                country_codes=claim_countries,
                evidence_class=evidence_class,
                temporal_scope=temporal_scope,
                source_scope=claim.get("source_ids") or [],
            )
        )
        if evidence_class == "official_statistic" and official_topic_required:
            # Required official statistics must be selected from independently
            # re-derived visible table metadata under the immutable goal topic
            # contract. A propagation loss or unstructured/generic statistic
            # cannot silently satisfy the class.
            if validated_topic_seed is None or not structured_official_statistic:
                facts = []
        complete_facts = [fact for fact in facts if fact.get("identity_complete")]
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
        matched_commercial_offer = None
        if evidence_class == "observed_primary_market":
            offer_topic_seed: Optional[TopicSeedContract] = None
            offer_topic_phrases: tuple[str, ...] = ()
            if validated_topic_seed is not None:
                offer_topic_phrases = product_topic_phrases(validated_topic_seed)
                if offer_topic_phrases:
                    offer_topic_seed = validated_topic_seed
            authorized_fact_ids: set[str] = set()
            for source in linked_sources:
                proof = source.get("authority_proof")
                raw_html = source.get("_structured_evidence_html")
                if not isinstance(proof, Mapping) or not isinstance(raw_html, str):
                    continue
                if (
                    not raw_html
                    or len(raw_html.encode("utf-8")) > 2_000_000
                    or hashlib.sha256(raw_html.encode("utf-8")).hexdigest()
                    != proof.get("structured_evidence_source_sha256")
                    or list(proof.get("commercial_offer_evidence") or [])
                    != _commercial_offer_evidence(raw_html)
                ):
                    continue
                for fact in complete_facts:
                    offer = fact_matching_offer_evidence(
                        proof,
                        fact_text,
                        str(fact.get("display_value") or ""),
                    )
                    if offer and offer_topic_seed is not None:
                        product_name = str(offer.get("product_name") or "")
                        if not any(
                            exact_topic_phrase_in_visible_text(
                                product_name, phrase
                            )
                            for phrase in offer_topic_phrases
                        ):
                            offer = None
                    if offer:
                        authorized_fact_ids.add(str(fact.get("fact_id") or ""))
                        matched_commercial_offer = matched_commercial_offer or offer
            for fact in facts:
                if (
                    fact.get("identity_complete")
                    and str(fact.get("fact_id") or "") not in authorized_fact_ids
                ):
                    fact["identity_complete"] = False
                    fact["identity_incomplete_reason"] = (
                        "material_price_not_bound_to_signed_product_offer"
                    )
            complete_facts = [
                fact
                for fact in facts
                if fact.get("identity_complete")
                and str(fact.get("fact_id") or "") in authorized_fact_ids
            ]
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
        elif (
            evidence_class == "official_statistic"
            and official_topic_required
            and validated_topic_seed is None
        ):
            reason = "topic_contract_missing_or_invalid"
        elif (
            evidence_class == "official_statistic"
            and official_topic_required
            and not structured_official_statistic
        ):
            reason = "official_statistic_visible_topic_binding_missing"
        elif (
            evidence_class == "official_statistic"
            and official_topic_required
            and not facts
        ):
            reason = "official_statistic_topic_mismatch_or_unbound"
        elif (
            evidence_class == "observed_primary_market"
            and observed_topic_required
            and offer_topic_seed is None
        ):
            reason = "topic_contract_missing_or_invalid"
        elif not facts:
            reason = "material_fact_not_extractable"
        elif evidence_class == "observed_primary_market" and not matched_commercial_offer:
            reason = (
                "observed_primary_market_topic_mismatch_or_unbound"
                if observed_topic_required
                else "material_price_not_bound_to_signed_product_offer"
            )
        elif evidence_class in {
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        } and not complete_facts:
            reason = "material_fact_identity_incomplete"
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
        if reason and status in {
            "verified_current_authoritative",
            "verified_traceable_calculation",
        }:
            status = "blocked_unverified"
        row = {
            "claim_id": claim_id,
            "status": status,
            "evidence_class": evidence_class,
            "country_codes": sorted(claim_countries),
            "source_ids": [str(source.get("source_id")) for source in linked_sources],
            "authoritative_source_ids": [str(source.get("source_id")) for source in valid_authorities],
            # Only complete typed targets can authorize synthesis or conflict
            # comparison. Candidate facts remain visible for bounded diagnosis.
            "facts": complete_facts,
            "candidate_facts": facts,
            "reason": reason,
            "effective_or_observation_at": (
                evidence_time.isoformat() if evidence_time else None
            ),
        }
        critical_rows.append(row)
        if reason:
            candidate_failures.append({"claim_id": claim_id, "reason": reason})

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
            candidate_failures.append(
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
    for index, left in enumerate(verified_facts):
        for right in verified_facts[index + 1:]:
            if _same_fact(left, right) and left["normalized_value"] != right["normalized_value"]:
                conflict = {
                    "left_fact_id": left["fact_id"],
                    "right_fact_id": right["fact_id"],
                    "values": [left["display_value"], right["display_value"]],
                }
                conflicts.append(conflict)
    requested_classes = set(requested_policy_classes)
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
        and row["status"] in {
            "verified_current_authoritative",
            "verified_traceable_calculation",
        }
        and row["facts"]
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
    if claim_class_applicability is None:
        # Compatibility callers that supply only mandatory classes mean those
        # classes literally. Production sends the deterministic goal contract.
        goal_applicable_classes |= {
            row["evidence_class"]
            for row in critical_rows
            if row["evidence_class"] in requested_classes
        }
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
        and row["facts"]
    }
    blocked: List[Dict[str, str]] = []
    for missing_class in sorted(required_classes - verified_classes):
        blocked.append(
            {
                "claim_id": "",
                "reason": f"mandatory_claim_class_missing:{missing_class}",
            }
        )
    missing_classes = sorted(required_classes - verified_classes)
    if conflicts:
        blocked.extend(
            {"claim_id": row["left_fact_id"], "reason": "conflicting_material_values"}
            for row in conflicts
        )

    has_complete_verified_fact = bool(verified_facts)
    coverage_satisfied = has_complete_verified_fact and not missing_classes
    if not has_complete_verified_fact:
        # Preserve the most actionable trust/provenance failure for a wholly
        # invalid evidence set, while also making the empty gate explicit.
        blocked.extend(candidate_failures)
        if not candidate_failures:
            blocked.append(
                {"claim_id": "", "reason": "no_verified_complete_material_facts"}
            )
    status = "passed" if coverage_satisfied and not conflicts else "blocked"
    if not critical_rows and not blocked:
        blocked.append({"claim_id": "", "reason": "no_material_critical_claims_identified"})
        status = "blocked"
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
            and bool(row["facts"])
            for row in critical_rows
        ),
        "blocked_count": len(blocked),
        "conflict_count": len(conflicts),
        "stale_count": sum(row["reason"] == "authoritative_source_stale" for row in blocked),
        "claims": critical_rows,
        "verified_facts": verified_facts,
        "conflicts": conflicts,
        "blocked_claims": blocked,
        "quarantined_claims": candidate_failures if coverage_satisfied else [],
        "quarantined_count": len(candidate_failures) if coverage_satisfied else 0,
        "candidate_rejection_counts": dict(
            sorted(Counter(row["reason"] for row in candidate_failures).items())
        ),
        "blocked_reason_counts": dict(
            sorted(Counter(row["reason"] for row in blocked).items())
        ),
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
        "topic_contract_status": topic_contract_status,
        "topic_seed_sha256": (
            validated_topic_seed.seed_sha256 if validated_topic_seed else None
        ),
        "missing_claim_classes": missing_classes,
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
