"""Fail-closed quality contracts for grounded commercial research.

The validators in this module are deliberately jurisdiction agnostic.  They
operate on evidence returned by the configured retrieval providers and never
embed a country fact as production truth.  A country-specific value may appear
in a regression fixture, but the runtime must prove it from current evidence.
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence
from urllib.parse import urlparse

import pycountry

from backend.services.research_source_authority_service import (
    _commercial_offer_evidence,
    _normalized_document_text,
    _structured_statistical_observations,
    claim_matching_offer_evidence,
    fact_matching_offer_evidence,
    validate_authority_claim_artifact,
    validate_authority_proof,
    validate_structured_statistical_claim_artifact,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    TopicSeedContract,
    ValidatedTopicAliasExpansion,
    evidence_topic_phrases_for_country,
    exact_topic_phrase_in_visible_text,
    match_visible_statistical_topic,
    product_topic_phrases,
    trusted_topic_alias_registry,
    validate_expected_trusted_topic_alias_expansion,
)


COMMERCIAL_MARKET_LAUNCH = "commercial_market_launch"
_CITABLE_EVIDENCE_STATUSES = {
    "verified_current_authoritative",
    "verified_traceable_calculation",
}
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
    r"\b(?:tax(?:es)?|vat|gst|dut(?:y|ies)|tariffs?|regulations?|regulatory|"
    r"licen[cs]es?|legal|laws?|compliance|bans?|deadlines?|effective|prices?|"
    r"costs?|fees?|margins?|market[\s\-–—]+sizes?|growth[\s\-–—]+rates?|populations?|sales|"
    r"pricing|revenues?|markups?|discounts?|conversion[\s\-–—]+rates?|cac|"
    r"profits?|roi|turnovers?|consumptions?|imports?|exports?|volumes?|currenc(?:y|ies)|"
    r"exchange[\s\-–—]+rates?|minimum[\s\-–—]+wages?|quotas?)\b",
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
_MATERIAL_DIMENSION_GROUPS = (
    ("import", "export"),
    ("retail", "wholesale"),
    ("consumer", "producer"),
    ("net", "gross"),
    ("adjusted", "unadjusted"),
    ("total", "per_capita"),
)
_STATUTORY_RATE_SUBTYPES = {
    "standard",
    "reduced",
    "zero",
    "exempt",
    "transitional",
}
_PRODUCT_CATEGORY_TERMS = {
    "adult",
    "baby",
    "bird",
    "cat",
    "child",
    "dog",
    "fish",
    "horse",
    "infant",
    "men",
    "rabbit",
    "women",
}
_PRODUCT_KIND_TERMS = {
    "accessory",
    "food",
    "medicine",
    "service",
    "subscription",
    "supplement",
    "toy",
}
_COUNTRY_NAME_TO_CODE = {
    str(country.name).casefold(): str(country.alpha_2).upper()
    for country in pycountry.countries
}
_COUNTRY_NAME_TO_CODE.update(
    {
        str(getattr(country, "official_name", "")).casefold(): str(
            country.alpha_2
        ).upper()
        for country in pycountry.countries
        if getattr(country, "official_name", None)
    }
)

_COUNTRY_CODE_TO_CODE = {
    str(country.alpha_2).upper(): str(country.alpha_2).upper()
    for country in pycountry.countries
}
# ``pycountry`` intentionally models ISO names/codes, not demonyms.  Keep the
# reviewed aliases that occur in commercial research prose separate from the
# ISO registry so an adjective can never be guessed into a jurisdiction.
_COUNTRY_DEMONYM_TO_CODE = {
    "american": "US",
    "brazilian": "BR",
    "british": "GB",
    "estonian": "EE",
    "german": "DE",
    "latvian": "LV",
}
_TEMPORAL_CUE = re.compile(
    r"\b(?:as[\s\-–—]+of|"
    r"takes?[\s\-–—]+effect(?:[\s\-–—]+(?:from|since|on))?|"
    r"effective(?:[\s\-–—]+(?:from|since|on))?|from|since)\b",
    re.IGNORECASE,
)
_MONTH_TOKEN = (
    r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|"
    r"Nov(?:ember)?|Dec(?:ember)?)\.?"
)
_DATE_CANDIDATE = re.compile(
    rf"^(?:"
    rf"\d{{4}}-\d{{1,2}}-\d{{1,2}}|"
    rf"\d{{1,2}}[./]\d{{1,2}}[./]\d{{4}}|"
    rf"\d{{1,2}}\s+{_MONTH_TOKEN}\s+\d{{4}}|"
    rf"{_MONTH_TOKEN}\s+\d{{1,2}}(?:,)?\s+\d{{4}}|"
    rf"{_MONTH_TOKEN}\s+\d{{4}}|"
    rf"\d{{4}}"
    rf")",
    re.IGNORECASE,
)
_DATE_IN_TEXT = re.compile(_DATE_CANDIDATE.pattern.removeprefix("^"), re.IGNORECASE)


def _jurisdiction_qualifiers(text: str) -> tuple[set[str], bool]:
    """Return explicit ISO jurisdictions and whether one is unrecognized.

    Alpha-2/alpha-3 codes are deliberately case-sensitive: ``US`` is a
    jurisdiction while ordinary prose ``us`` is not. Unknown demonym-shaped
    qualifiers beside a material concept fail closed instead of being silently
    treated as product vocabulary.
    """

    normalized = " ".join(str(text or "").casefold().split())
    codes: set[str] = set()
    for name, code in _COUNTRY_NAME_TO_CODE.items():
        if not name:
            continue
        country_pattern = re.escape(name).replace(r"\ ", r"\s+")
        if re.search(r"(?<!\w)" + country_pattern + r"(?!\w)", normalized):
            codes.add(code)
    for demonym, code in _COUNTRY_DEMONYM_TO_CODE.items():
        if re.search(rf"(?<!\w){re.escape(demonym)}(?!\w)", normalized):
            codes.add(code)
    for token in re.findall(r"(?<![A-Za-z])([A-Z]{2})(?![A-Za-z])", str(text or "")):
        code = _COUNTRY_CODE_TO_CODE.get(token)
        if code:
            codes.add(code)
    known_demonyms = set(_COUNTRY_DEMONYM_TO_CODE)
    unknown = any(
        match.group(1).casefold() not in known_demonyms
        for match in re.finditer(
            r"\b([A-Za-z]{4,}(?:ian|ese|ish))\b"
            r"(?=(?:\W+\w+){0,5}\W+(?:vat|gst|tax|prices?|offers?|"
            r"markets?|imports?|exports?|statistics?|sales|revenues?))",
            str(text or ""),
            re.IGNORECASE,
        )
    )
    return codes, unknown


def _explicit_country_codes(text: str) -> set[str]:
    return _jurisdiction_qualifiers(text)[0]


def _strict_market_country_codes(value: Any) -> set[str]:
    """Read formula jurisdictions only from an explicit unique ISO-2 list."""

    if not isinstance(value, Mapping):
        return set()
    return _strict_iso_country_code_values(value.get("countries"))


def _strict_iso_country_code_values(raw_countries: Any) -> set[str]:
    if (
        not isinstance(raw_countries, Sequence)
        or isinstance(raw_countries, (str, bytes))
        or not raw_countries
    ):
        return set()
    if any(
        not isinstance(raw_code, str) or raw_code not in _COUNTRY_CODE_TO_CODE
        for raw_code in raw_countries
    ):
        return set()
    countries = set(raw_countries)
    return countries if len(countries) == len(raw_countries) else set()


def _parse_date_candidate(raw: str) -> Optional[tuple[str, str]]:
    candidate = re.sub(r"(?<=[A-Za-z])\.", "", raw.strip().rstrip(".,;:"))
    candidate = re.sub(r"\s+", " ", candidate)
    for pattern, precision in (
        ("%Y-%m-%d", "day"),
        ("%d.%m.%Y", "day"),
        ("%d/%m/%Y", "day"),
        ("%d %B %Y", "day"),
        ("%d %b %Y", "day"),
        ("%B %d, %Y", "day"),
        ("%B %d %Y", "day"),
        ("%b %d, %Y", "day"),
        ("%b %d %Y", "day"),
        ("%B %Y", "month"),
        ("%b %Y", "month"),
        ("%Y", "year"),
    ):
        try:
            parsed = datetime.strptime(candidate.title(), pattern).date()
        except (ValueError, OverflowError):
            continue
        value = (
            parsed.isoformat()
            if precision == "day"
            else parsed.strftime("%Y-%m")
            if precision == "month"
            else parsed.strftime("%Y")
        )
        return precision, value
    return None


def _explicit_temporal_references(text: str) -> tuple[list[tuple[str, str]], bool]:
    """Parse explicit effective/as-of dates without guessing malformed dates."""

    references: list[tuple[str, str]] = []
    invalid = False
    for cue in _TEMPORAL_CUE.finditer(str(text or "")):
        tail = str(text or "")[cue.end():].lstrip(" :,-")[:64]
        tail = re.sub(r"^on\s+", "", tail, flags=re.IGNORECASE)
        match = _DATE_CANDIDATE.match(tail)
        cue_text = cue.group(0).casefold()
        looks_temporal = bool(
            match
            or cue_text != "from"
            or re.match(rf"(?:\d|{_MONTH_TOKEN}\b)", tail, re.IGNORECASE)
        )
        if not looks_temporal:
            continue
        if not match:
            invalid = True
            continue
        parsed = _parse_date_candidate(match.group(0))
        if parsed is None:
            invalid = True
        else:
            references.append(parsed)
    return references, invalid


def _temporal_scope_parts(value: Any) -> set[tuple[str, str]]:
    text = str(value or "").strip()
    if not text:
        return set()
    parsed_iso = _iso_datetime(text)
    if parsed_iso:
        date = parsed_iso.date()
        return {
            ("day", date.isoformat()),
            ("month", date.strftime("%Y-%m")),
            ("year", date.strftime("%Y")),
            (
                "quarter",
                f"{date.year}-Q{((date.month - 1) // 3) + 1}",
            ),
        }
    quarters = {
        ("quarter", f"{year}-Q{q_number or ordinal_number}")
        for q_number, ordinal_number, year in re.findall(
            r"\b(?:Q([1-4])|([1-4])(?:st|nd|rd|th)?\s+quarter)\s+"
            r"((?:19|20)\d{2})\b",
            text,
            re.IGNORECASE,
        )
    }
    years = re.findall(r"(?<!\d)((?:19|20)\d{2})(?!\d)", text)
    return quarters | {("year", year) for year in years}


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
            if key not in {"calculation_kind", "formula"}
            if isinstance(child, (str, int, float)) and child not in ("", None)
        ).strip()
        if value.get("formula") or (
            text
            and extract_material_facts(
                text, claim_id=path or "prd", force_material=True
            )
        ):
            yield path or "commercial_prd", value
        for key, child in value.items():
            if key in {
                "calculation_kind",
                "claim",
                "claim_ids",
                "statement",
                "value",
                "description",
                "text",
                "formula",
                "input_bindings",
                "input_claim_ids",
                "validation_plan",
            }:
                continue
            child_path = f"{path}.{key}" if path else str(key)
            yield from _iter_material_nodes(child, child_path)
    elif isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        for index, child in enumerate(value):
            yield from _iter_material_nodes(child, f"{path}[{index}]")
    elif isinstance(value, str) and extract_material_facts(
        value, claim_id=path or "prd", force_material=True
    ):
        yield path or "commercial_prd", {"statement": value}


def _has_traceable_calculation(
    value: Any,
    verified_claim_ids: set[str],
    verified_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
    required_country_codes: set[str],
    required_topic_seed_sha256: str,
) -> bool:
    if not isinstance(value, Mapping):
        return False
    calculation_key = "observed_pack_price_difference"
    calculation = value.get(calculation_key)
    if not isinstance(calculation, Mapping) or not _formula_has_typed_bindings(
        calculation,
        verified_claim_ids=verified_claim_ids,
        verified_facts_by_claim=verified_facts_by_claim,
        required_country_codes=required_country_codes,
        required_topic_seed_sha256=required_topic_seed_sha256,
    ):
        return False

    # The machine-only formula cannot hide or replace its human-visible
    # evidence. Each exact bound offer must appear in its own immediate pricing
    # sibling, locally citing only that claim and matching only that fact.
    bindings = calculation["input_bindings"]
    sibling_keys = {
        "higher_observed_pack_price": "higher_observed_benchmark_pack",
        "lower_observed_pack_price": "lower_observed_benchmark_pack",
    }
    for symbol, binding in bindings.items():
        claim_id = str(binding["claim_id"])
        fact_id = str(binding["fact_id"])
        matches = [
            fact
            for fact in verified_facts_by_claim.get(claim_id, ())
            if str(fact.get("claim_id") or "") == claim_id
            and str(fact.get("fact_id") or "") == fact_id
            and fact.get("identity_complete") is True
        ]
        if len(matches) != 1:
            return False
        sibling = value.get(sibling_keys[symbol])
        sibling_claims = (
            sibling.get("claim_ids") if isinstance(sibling, Mapping) else None
        )
        if (
            not isinstance(sibling, Mapping)
            or not isinstance(sibling_claims, Sequence)
            or isinstance(sibling_claims, (str, bytes))
            or list(sibling_claims) != [claim_id]
            or set(sibling) != {"statement", "claim_ids"}
            or not _bound_observed_offer_sibling_matches(sibling, matches[0])
        ):
            return False
    return True


def _formula_symbol_matches_observed_pack_price(
    symbol: str, fact: Mapping[str, Any]
) -> bool:
    return bool(
        symbol
        in {"higher_observed_pack_price", "lower_observed_pack_price"}
        and str(fact.get("evidence_class") or "") == "observed_primary_market"
        and str(fact.get("metric_key") or "").casefold()
        == f"price:{str(fact.get('unit') or '').casefold()}"
        and str(fact.get("unit") or "").casefold()
        not in {"", "number", "percent"}
        and str(fact.get("semantic_scope") or "").casefold().startswith(
            "catalog:signed_offer:"
        )
    )


def _canonical_observed_pack_tokens(fact: Mapping[str, Any]) -> list[str]:
    tokens: list[str] = []
    for term in fact.get("fact_terms") or []:
        match = re.fullmatch(
            r"(\d+(?:[.,]\d+)?)(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)",
            str(term).casefold(),
        )
        if match:
            tokens.append(f"{match.group(1).replace(',', '.')}{match.group(2)}")
    return tokens


def _has_disallowed_identity_codepoint(value: Any) -> bool:
    """Reject controls, format controls, and surrogates in durable identity."""

    return any(
        unicodedata.category(character) in {"Cc", "Cf", "Cs"}
        or 0xFE00 <= ord(character) <= 0xFE0F
        or 0xE0100 <= ord(character) <= 0xE01EF
        for character in str(value or "")
    )


def _canonical_offer_identity_surface(value: Any) -> Optional[str]:
    """Normalize case/whitespace while preserving identity punctuation/order."""

    normalized = unicodedata.normalize("NFKC", str(value or ""))
    if _has_disallowed_identity_codepoint(normalized):
        return None
    surface = " ".join(normalized.split()).casefold()
    return surface or None


def _identity_prefix_surface(value: str, pack_start: int) -> Optional[str]:
    # Only punctuation immediately separating identity from its package may
    # vary. Internal punctuation (C++, C#, .NET, S/4HANA, flavors) and token
    # order remain exact signed product identity.
    prefix = value[:pack_start].rstrip()
    prefix = prefix.rstrip(" ,;:|/().-\u2013\u2014")
    return _canonical_offer_identity_surface(prefix)


def _has_standalone_pack_sign(value: str, pack_start: int) -> bool:
    prefix = unicodedata.normalize("NFKC", value[:pack_start]).rstrip()
    return re.search(r"(?:^|\s)[+\-]\s*$", prefix) is not None


def _signed_offer_identity_surface(
    verified: Mapping[str, Any], *, canonical_pack: str
) -> Optional[str]:
    """Return identity surface from the exact HMAC-bound visible product name.

    ``signed_offer_product_name`` is copied onto the fact only after
    ``fact_matching_offer_evidence`` has revalidated the raw-derived signed
    offer.  Old/lossy ledgers that expose only ``fact_terms`` deliberately fail
    this strict observed-offer adapter.
    """

    product_name = verified.get("signed_offer_product_name")
    if (
        not isinstance(product_name, str)
        or not product_name.strip()
        or len(product_name) > 300
        or _has_disallowed_identity_codepoint(product_name)
    ):
        return None
    normalized = unicodedata.normalize("NFKC", product_name)
    if _has_disallowed_identity_codepoint(normalized):
        return None
    pack_matches = list(
        re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            normalized,
            re.IGNORECASE,
        )
    )
    if not pack_matches:
        # Some catalogues expose the immutable product name and package size
        # in separate visible fields.  The fact's singleton canonical pack is
        # still required below by every candidate matcher; only the signed
        # name's identity surface is pack-free in this producer shape.
        return _canonical_offer_identity_surface(normalized)
    if len(pack_matches) != 1:
        return None
    pack_match = pack_matches[0]
    signed_pack = (
        f"{pack_match.group(1).replace(',', '.')}"
        f"{pack_match.group(2).casefold()}"
    )
    if (
        signed_pack != canonical_pack
        or _has_standalone_pack_sign(normalized, pack_match.start())
        or re.fullmatch(
            r"[\s,;:|/().\-\u2013\u2014]*", normalized[pack_match.end() :]
        )
        is None
    ):
        return None
    return _identity_prefix_surface(normalized, pack_match.start())


def _bound_observed_offer_sibling_matches(
    sibling: Mapping[str, Any], verified: Mapping[str, Any]
) -> bool:
    """Require the exact product identity represented by a bound offer fact.

    This is deliberately stricter than ordinary PRD citation paraphrasing. A
    typed calculation depends on these immediate sibling nodes, so a fuzzy
    overlap cannot substitute or omit a signed product variant.
    """

    statement = sibling.get("statement")
    if (
        not isinstance(statement, str)
        or not statement.strip()
        or _has_disallowed_identity_codepoint(statement)
    ):
        return False
    verified_packs = _canonical_observed_pack_tokens(verified)
    pack_matches = list(
        re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            statement,
            re.IGNORECASE,
        )
    )
    if len(verified_packs) != 1 or len(pack_matches) != 1:
        return False
    pack_match = pack_matches[0]
    if _has_standalone_pack_sign(statement, pack_match.start()):
        return False
    candidate_pack = (
        f"{pack_match.group(1).replace(',', '.')}"
        f"{pack_match.group(2).casefold()}"
    )
    if candidate_pack != verified_packs[0]:
        return False

    material_facts = extract_material_facts(
        statement,
        claim_id="bound_observed_offer",
        force_material=True,
        include_text_spans=True,
    )
    pack_start, pack_end = pack_match.span(1)
    displayed_facts = [
        fact
        for fact in material_facts
        if not (
            # A digit-bearing model/SKU inside the exact signed product-name
            # prefix is identity, not a displayed calculation/value.
            int(fact.get("_text_end", -1)) <= pack_match.start()
            or (
                fact.get("unit") == "number"
                and int(fact.get("_text_start", -1)) < pack_end
                and int(fact.get("_text_end", -1)) > pack_start
            )
        )
    ]
    if len(displayed_facts) != 1:
        return False
    displayed = displayed_facts[0]
    if (
        displayed.get("unit") != verified.get("unit")
        or not _normalized_material_values_equal(
            displayed.get("normalized_value"), verified.get("normalized_value")
        )
    ):
        return False

    normalized_statement = unicodedata.normalize("NFKC", statement).casefold()
    normalized_pack_matches = list(
        re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            normalized_statement,
            re.IGNORECASE,
        )
    )
    normalized_price_matches = [
        match
        for match in _MATERIAL_VALUE.finditer(normalized_statement)
        if _material_unit(match.group(0)) == verified.get("unit")
        and _normalized_material_values_equal(
            _normalized_value(match.group(0), str(verified.get("unit") or "")),
            verified.get("normalized_value"),
        )
    ]
    if len(normalized_pack_matches) != 1 or len(normalized_price_matches) != 1:
        return False
    normalized_pack = normalized_pack_matches[0]
    normalized_price = normalized_price_matches[0]
    if normalized_price.start() < normalized_pack.end():
        return False
    formatting_only = r"[\s,;:|/().\-\u2013\u2014]*"
    if (
        re.fullmatch(
            formatting_only,
            normalized_statement[normalized_pack.end() : normalized_price.start()],
        )
        is None
        or re.fullmatch(
            formatting_only, normalized_statement[normalized_price.end() :]
        )
        is None
    ):
        return False
    verified_identity = _signed_offer_identity_surface(
        verified, canonical_pack=verified_packs[0]
    )
    candidate_identity = _identity_prefix_surface(
        normalized_statement, normalized_pack.start()
    )
    return bool(
        verified_identity
        and candidate_identity
        and candidate_identity == verified_identity
    )


def _bound_observed_offer_identity_only_matches(
    node: Mapping[str, Any], verified: Mapping[str, Any]
) -> bool:
    """Match one signed catalogue identity without treating its pack as a price.

    Competitor schemas sometimes split ``product_name`` from ``observed_price``.
    A decimal package such as ``3,5 kg`` is material to the exact product
    identity, but it is not an independently observed numeric fact.  This
    matcher therefore suppresses only the one exact signed pack occurrence and
    requires every remaining product token to equal the immutable fact terms.
    """

    statement = node.get("statement")
    if (
        not isinstance(statement, str)
        or not statement.strip()
        or _has_disallowed_identity_codepoint(statement)
    ):
        return False
    verified_packs = _canonical_observed_pack_tokens(verified)
    pack_matches = list(
        re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            statement,
            re.IGNORECASE,
        )
    )
    if len(verified_packs) != 1 or len(pack_matches) != 1:
        return False
    pack_match = pack_matches[0]
    candidate_pack = (
        f"{pack_match.group(1).replace(',', '.')}"
        f"{pack_match.group(2).casefold()}"
    )
    if (
        _has_standalone_pack_sign(statement, pack_match.start())
        or candidate_pack != verified_packs[0]
    ):
        return False

    material_facts = extract_material_facts(
        statement,
        claim_id="bound_observed_offer_identity",
        force_material=True,
        include_text_spans=True,
    )
    pack_start, pack_end = pack_match.span(1)
    if any(
        not (
            int(fact.get("_text_end", -1)) <= pack_match.start()
            or (
                fact.get("unit") == "number"
                and int(fact.get("_text_start", -1)) < pack_end
                and int(fact.get("_text_end", -1)) > pack_start
            )
        )
        for fact in material_facts
    ):
        return False

    normalized_statement = unicodedata.normalize("NFKC", statement).casefold()
    normalized_pack_matches = list(
        re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            normalized_statement,
            re.IGNORECASE,
        )
    )
    if len(normalized_pack_matches) != 1:
        return False
    normalized_pack = normalized_pack_matches[0]
    if re.fullmatch(
        r"[\s,;:|/().\-\u2013\u2014]*",
        normalized_statement[normalized_pack.end() :],
    ) is None:
        return False
    verified_identity = _signed_offer_identity_surface(
        verified, canonical_pack=verified_packs[0]
    )
    candidate_identity = _identity_prefix_surface(
        normalized_statement, normalized_pack.start()
    )
    return bool(
        verified_identity
        and candidate_identity
        and candidate_identity == verified_identity
    )


_COMPETITOR_OBSERVED_PRICE_PATH = re.compile(
    r"competitors\[\d+\]\.observed_skus\[\d+\]\.observed_price"
)
_COMPETITOR_PRODUCT_NAME_PATH = re.compile(
    r"competitors\[\d+\]\.observed_skus\[\d+\]\.product_name"
)
_COMPETITOR_OBSERVED_PRODUCT_PATH = re.compile(
    r"competitors\[\d+\]\.observed_product"
)
_REVIEWED_PRICING_OFFER_PATH = re.compile(
    r"pricing_and_unit_economics\."
    r"(?:higher_observed_benchmark_pack|lower_observed_benchmark_pack)"
)


def _path_requires_strict_signed_offer(
    path: str,
    cited_claim_ids: set[str],
    ledger_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
) -> bool:
    if _COMPETITOR_OBSERVED_PRICE_PATH.fullmatch(
        path
    ) or _COMPETITOR_PRODUCT_NAME_PATH.fullmatch(path):
        return True
    return any(
        str(fact.get("evidence_class") or "") == "observed_primary_market"
        for claim_id in cited_claim_ids
        for fact in ledger_facts_by_claim.get(claim_id, ())
    )


def _path_scoped_signed_offer_matches(
    node: Mapping[str, Any],
    *,
    path: str,
    cited_claim_ids: set[str],
    ledger_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
    required_country_codes: set[str],
    required_topic_seed_sha256: str,
) -> bool:
    """Accept exact signed-offer surfaces only at reviewed commercial paths.

    This compatibility route does not infer or attach provenance.  It requires
    one model-supplied citable claim ID, one complete ledger-owned signed offer,
    and an exact two-key display node.  The general material-fact matcher stays
    unchanged for every other PRD surface.
    """

    if set(node) != {"statement", "claim_ids"} or len(cited_claim_ids) != 1:
        return False
    raw_claim_ids = node.get("claim_ids")
    if (
        not isinstance(raw_claim_ids, Sequence)
        or isinstance(raw_claim_ids, (str, bytes))
    ):
        return False
    claim_id = next(iter(cited_claim_ids))
    if list(raw_claim_ids) != [claim_id]:
        return False
    facts = [
        fact
        for fact in ledger_facts_by_claim.get(claim_id, ())
        if str(fact.get("claim_id") or "") == claim_id
        and fact.get("identity_complete") is True
        and str(fact.get("evidence_class") or "") == "observed_primary_market"
        and str(fact.get("unit") or "").casefold()
        not in {"", "number", "percent"}
        and re.fullmatch(
            rf"catalog:signed_offer:[^:]+:per_item:"
            rf"{re.escape(str(fact.get('unit') or '').casefold())}",
            str(fact.get("semantic_scope") or "").casefold(),
        )
        and str(fact.get("metric_key") or "").casefold()
        == f"price:{str(fact.get('unit') or '').casefold()}"
        and str(fact.get("topic_seed_sha256") or "")
        == required_topic_seed_sha256
    ]
    if len(facts) != 1:
        return False
    verified = facts[0]
    verified_countries = {
        str(code).upper() for code in verified.get("country_codes") or [] if code
    }
    if (
        len(verified_countries) != 1
        or not required_country_codes
        or not verified_countries.issubset(required_country_codes)
        or re.fullmatch(r"[a-f0-9]{64}", required_topic_seed_sha256) is None
    ):
        return False
    if _COMPETITOR_PRODUCT_NAME_PATH.fullmatch(path):
        return _bound_observed_offer_identity_only_matches(node, verified)
    if _COMPETITOR_OBSERVED_PRICE_PATH.fullmatch(
        path
    ) or _COMPETITOR_OBSERVED_PRODUCT_PATH.fullmatch(
        path
    ) or _REVIEWED_PRICING_OFFER_PATH.fullmatch(path):
        return _bound_observed_offer_sibling_matches(node, verified)
    return False


def _reviewed_observed_sku_contract_issues(
    commercial: Mapping[str, Any],
    ledger_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
    required_country_codes: set[str],
    required_topic_seed_sha256: str,
) -> list[dict[str, str]]:
    """Validate locally paired competitor SKU identity and price evidence."""

    issues: list[dict[str, str]] = []
    competitors = commercial.get("competitors")
    if not isinstance(competitors, Sequence) or isinstance(
        competitors, (str, bytes)
    ):
        return issues
    for competitor_index, competitor in enumerate(competitors):
        if not isinstance(competitor, Mapping) or "observed_skus" not in competitor:
            continue
        competitor_path = f"competitors[{competitor_index}]"
        if set(competitor) != {"observed_skus"}:
            issues.append(
                {
                    "code": "observed_sku_competitor_shape_invalid",
                    "message": (
                        f"{competitor_path} may contain only observed_skus; omit "
                        "unverified brand, manufacturer, identity, or grouping "
                        "fields and retain the signed identity in each child."
                    ),
                }
            )
        observed_skus = competitor.get("observed_skus")
        if not isinstance(observed_skus, Sequence) or isinstance(
            observed_skus, (str, bytes)
        ):
            issues.append(
                {
                    "code": "observed_sku_pair_invalid",
                    "message": f"{competitor_path}.observed_skus must be a list.",
                }
            )
            continue
        for sku_index, sku in enumerate(observed_skus):
            sku_path = f"{competitor_path}.observed_skus[{sku_index}]"
            if not isinstance(sku, Mapping):
                issues.append(
                    {
                        "code": "observed_sku_pair_invalid",
                        "message": (
                            f"{sku_path} must locally pair one signed product_name "
                            "with its observed_price."
                        ),
                    }
                )
                continue
            product_name = sku.get("product_name")
            observed_price = sku.get("observed_price")

            def claim_ids(value: Any) -> set[str]:
                raw = value.get("claim_ids") if isinstance(value, Mapping) else None
                if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)):
                    return set()
                return {str(item) for item in raw if item}

            product_claims = claim_ids(product_name)
            price_claims = claim_ids(observed_price)
            product_path = f"{sku_path}.product_name"
            price_path = f"{sku_path}.observed_price"
            valid_pair = bool(
                isinstance(product_name, Mapping)
                and isinstance(observed_price, Mapping)
                and set(sku) == {"product_name", "observed_price"}
                and len(product_claims) == 1
                and product_claims == price_claims
                and _path_scoped_signed_offer_matches(
                    product_name,
                    path=product_path,
                    cited_claim_ids=product_claims,
                    ledger_facts_by_claim=ledger_facts_by_claim,
                    required_country_codes=required_country_codes,
                    required_topic_seed_sha256=required_topic_seed_sha256,
                )
                and _path_scoped_signed_offer_matches(
                    observed_price,
                    path=price_path,
                    cited_claim_ids=price_claims,
                    ledger_facts_by_claim=ledger_facts_by_claim,
                    required_country_codes=required_country_codes,
                    required_topic_seed_sha256=required_topic_seed_sha256,
                )
            )
            if not valid_pair:
                issues.append(
                    {
                        "code": "observed_sku_pair_invalid",
                        "message": (
                            f"{sku_path} must contain exact product_name and "
                            "observed_price objects with the same singleton signed "
                            "offer claim_id."
                        ),
                    }
                )
    return issues


def _strict_positive_fact_decimal(fact: Mapping[str, Any]) -> Optional[Decimal]:
    unit = str(fact.get("unit") or "").casefold()
    normalized = str(fact.get("normalized_value") or "")
    match = re.fullmatch(
        rf"(0|[1-9]\d*)(?:\.(\d+))?:{re.escape(unit)}", normalized
    )
    if not unit or match is None:
        return None
    numeric = match.group(1)
    if match.group(2) is not None:
        numeric += f".{match.group(2)}"
    try:
        value = Decimal(numeric)
    except (InvalidOperation, ValueError):
        return None
    return value if value.is_finite() and value > 0 else None


def _parse_formula_assignment(formula: str) -> Optional[tuple[str, ast.AST]]:
    """Parse the deliberately tiny, non-executable formula language."""

    if formula.count("=") != 1:
        return None
    lhs, rhs = (part.strip() for part in formula.split("=", 1))
    if not re.fullmatch(r"[a-z]+(?:_[a-z]+)*", lhs):
        return None
    if "target" in lhs.split("_"):
        return None
    if re.search(r"\d", rhs):
        # Enforce decimal lexical form before Python's AST normalizes 0x1,
        # 0b1, exponent notation or underscored literals to an integer value.
        if re.search(r"[A-Za-z_]\w*\d|\d\w*[A-Za-z_]", rhs):
            return None
        digit_tokens = re.findall(r"(?<![\w.])\d+(?![\w.])", rhs)
        if any(token not in {"0", "1", "100"} for token in digit_tokens):
            return None
        if sum(len(token) for token in digit_tokens) != sum(char.isdigit() for char in rhs):
            return None
    try:
        expression = ast.parse(rhs, mode="eval")
    except (SyntaxError, ValueError, TypeError, MemoryError, RecursionError):
        return None
    allowed_operators = (ast.Add, ast.Sub, ast.Mult, ast.Div)
    for node in ast.walk(expression):
        if isinstance(node, ast.Expression):
            continue
        if isinstance(node, ast.BinOp):
            if not isinstance(node.op, allowed_operators):
                return None
            continue
        if isinstance(node, allowed_operators):
            continue
        if isinstance(node, ast.Name):
            if not re.fullmatch(r"[a-z]+(?:_[a-z]+)*", node.id):
                return None
            continue
        if isinstance(node, ast.Load):
            continue
        if isinstance(node, ast.Constant):
            if type(node.value) is not int or node.value not in {0, 1, 100}:
                return None
            continue
        # Calls, attributes, subscripts, comparisons, boolean operators,
        # unary signs, strings and every other syntax are outside this narrow
        # non-executable arithmetic contract.
        return None
    return lhs, expression.body


def _formula_has_typed_bindings(
    node: Mapping[str, Any],
    *,
    verified_claim_ids: set[str],
    verified_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
    required_country_codes: set[str],
    required_topic_seed_sha256: str,
) -> bool:
    """Validate exact symbol -> citable fact ownership and unit-safe arithmetic."""

    formula = str(node.get("formula") or "").strip()
    parsed = _parse_formula_assignment(formula)
    raw_inputs = node.get("input_claim_ids")
    bindings = node.get("input_bindings")
    calculation_kind = str(node.get("calculation_kind") or "")
    expected_binding_symbols = {
        "observed_pack_price_difference": {
            "higher_observed_pack_price",
            "lower_observed_pack_price",
        },
    }.get(calculation_kind)
    if (
        set(node)
        != {
            "calculation_kind",
            "formula",
            "input_bindings",
            "input_claim_ids",
        }
        or expected_binding_symbols is None
        or parsed is None
        or not isinstance(raw_inputs, Sequence)
        or isinstance(raw_inputs, (str, bytes))
        or not isinstance(bindings, Mapping)
        or set(bindings) != expected_binding_symbols
    ):
        return False
    lhs, rhs = parsed
    inputs = {str(item) for item in raw_inputs if item}
    if (
        len(raw_inputs) != 2
        or len(inputs) != 2
        or not inputs.issubset(verified_claim_ids)
    ):
        return False

    resolved: dict[str, Mapping[str, Any]] = {}
    owned_fact_keys: set[tuple[str, str]] = set()
    owned_fact_ids: set[str] = set()
    for symbol, binding in bindings.items():
        if (
            not isinstance(symbol, str)
            or not re.fullmatch(r"[a-z]+(?:_[a-z]+)*", symbol)
            or symbol == lhs
            or not isinstance(binding, Mapping)
            or set(binding) != {"claim_id", "fact_id"}
        ):
            return False
        claim_id = str(binding.get("claim_id") or "")
        fact_id = str(binding.get("fact_id") or "")
        if claim_id not in inputs or not fact_id:
            return False
        global_fact_id_matches = [
            fact
            for facts in verified_facts_by_claim.values()
            for fact in facts
            if str(fact.get("fact_id") or "") == fact_id
        ]
        matches = [
            fact
            for owner_claim_id, facts in verified_facts_by_claim.items()
            for fact in facts
            if str(fact.get("fact_id") or "") == fact_id
            and str(owner_claim_id) == claim_id
            and str(fact.get("claim_id") or "") == claim_id
            and fact.get("identity_complete") is True
        ]
        fact_key = (claim_id, fact_id)
        if (
            len(global_fact_id_matches) != 1
            or len(matches) != 1
            or fact_key in owned_fact_keys
            or fact_id in owned_fact_ids
        ):
            return False
        role_matches = _formula_symbol_matches_observed_pack_price(
            symbol, matches[0]
        )
        if not role_matches:
            return False
        resolved[symbol] = matches[0]
        owned_fact_keys.add(fact_key)
        owned_fact_ids.add(fact_id)
    if inputs != {str(binding["claim_id"]) for binding in bindings.values()}:
        return False
    rhs_names = {item.id for item in ast.walk(rhs) if isinstance(item, ast.Name)}
    if rhs_names != set(resolved):
        return False

    # This release intentionally supports reviewed calculations instead of
    # pretending arbitrary model-authored algebra has known business meaning.
    # Exact AST shape gives the pack-total subtraction a deterministic meaning
    # while typed bindings below prove both inputs without executing model code.
    expected_formula = {
        "observed_pack_price_difference": (
            "observed_pack_price_difference",
            "higher_observed_pack_price - lower_observed_pack_price",
        ),
    }[calculation_kind]
    expected_lhs, expected_rhs_text = expected_formula
    expected_formula_text = f"{expected_lhs} = {expected_rhs_text}"
    if formula != expected_formula_text:
        return False
    expected_rhs = ast.parse(expected_rhs_text, mode="eval").body
    if lhs != expected_lhs or ast.dump(
        rhs, include_attributes=False
    ) != ast.dump(expected_rhs, include_attributes=False):
        return False
    higher_fact = resolved["higher_observed_pack_price"]
    lower_fact = resolved["lower_observed_pack_price"]
    higher_countries = {
        str(code).upper() for code in higher_fact.get("country_codes") or [] if code
    }
    lower_countries = {
        str(code).upper() for code in lower_fact.get("country_codes") or [] if code
    }
    higher_scope = str(higher_fact.get("semantic_scope") or "").casefold()
    lower_scope = str(lower_fact.get("semantic_scope") or "").casefold()
    higher_basis = re.fullmatch(
        r"catalog:signed_offer:[^:]+:(per_[a-z]+):([a-z]{3})", higher_scope
    )
    lower_basis = re.fullmatch(
        r"catalog:signed_offer:[^:]+:(per_[a-z]+):([a-z]{3})", lower_scope
    )
    higher_topic_seed = str(higher_fact.get("topic_seed_sha256") or "")
    lower_topic_seed = str(lower_fact.get("topic_seed_sha256") or "")
    higher_packs = _canonical_observed_pack_tokens(higher_fact)
    lower_packs = _canonical_observed_pack_tokens(lower_fact)
    higher_value = _strict_positive_fact_decimal(higher_fact)
    lower_value = _strict_positive_fact_decimal(lower_fact)
    if (
        len(higher_countries) != 1
        or len(lower_countries) != 1
        or higher_countries != lower_countries
        or not required_country_codes
        or not higher_countries.issubset(required_country_codes)
        or higher_fact.get("unit") != lower_fact.get("unit")
        or higher_basis is None
        or lower_basis is None
        or higher_basis.groups() != lower_basis.groups()
        or higher_basis.group(2) != str(higher_fact.get("unit") or "").casefold()
        or lower_basis.group(2) != str(lower_fact.get("unit") or "").casefold()
        or len(higher_packs) != 1
        or len(lower_packs) != 1
        or re.fullmatch(r"[a-f0-9]{64}", required_topic_seed_sha256) is None
        or higher_topic_seed != required_topic_seed_sha256
        or lower_topic_seed != required_topic_seed_sha256
        or higher_value is None
        or lower_value is None
        or higher_value <= lower_value
    ):
        return False

    invalid = object()
    zero = object()

    def fact_type(fact: Mapping[str, Any]) -> str:
        unit = str(fact.get("unit") or "").casefold()
        if unit == "percent":
            return "percent"
        if unit in {"eur", "usd", "gbp"} or unit in {
            str(currency.alpha_3).casefold() for currency in pycountry.currencies
        }:
            return f"currency:{unit}"
        if unit in {"day", "month", "year"}:
            return f"duration:{unit}"
        return f"unit:{unit or 'number'}"

    def infer(expression: ast.AST) -> object:
        if isinstance(expression, ast.Name):
            return fact_type(resolved[expression.id])
        if isinstance(expression, ast.Constant):
            if expression.value == 0:
                return zero
            if expression.value == 1:
                return "dimensionless"
            return invalid
        if not isinstance(expression, ast.BinOp):
            return invalid
        # One explicit exception to the neutral-literal rule: an exact percent
        # input may be converted to a ratio only in this immediate AST shape.
        if (
            isinstance(expression.op, ast.Div)
            and isinstance(expression.left, ast.Name)
            and isinstance(expression.right, ast.Constant)
            and expression.right.value == 100
            and str(resolved[expression.left.id].get("unit") or "").casefold()
            == "percent"
        ):
            return "dimensionless"
        left_type = infer(expression.left)
        right_type = infer(expression.right)
        if left_type is invalid or right_type is invalid:
            return invalid
        if isinstance(expression.op, (ast.Add, ast.Sub)):
            if right_type is zero:
                return left_type
            if left_type is zero and isinstance(expression.op, ast.Add):
                return right_type
            return left_type if left_type == right_type else invalid
        if isinstance(expression.op, ast.Mult):
            if left_type is zero or right_type is zero:
                return invalid
            if left_type == "dimensionless":
                return right_type
            if right_type == "dimensionless":
                return left_type
            return invalid
        if isinstance(expression.op, ast.Div):
            if right_type == "dimensionless":
                return left_type
            if left_type == right_type and left_type is not zero:
                return "dimensionless"
            return invalid
        return invalid

    result_type = infer(rhs)
    if result_type is invalid or result_type is zero:
        return False
    return isinstance(result_type, str) and result_type.startswith("currency:")


def _material_facts_match_cited_evidence(
    node: Mapping[str, Any],
    *,
    path: str,
    cited_claim_ids: set[str],
    verified_facts_by_claim: Mapping[str, Sequence[Mapping[str, Any]]],
) -> bool:
    """Require every material value to match a fact owned by a cited claim.

    PRD facts do not carry trusted evidence-class/temporal/source metadata, so
    coupling uses the immutable normalized value plus explicit metric identity
    or conservative term overlap. Merely naming any valid ledger ID is never
    sufficient, and one matching value cannot launder another value in the
    same object.
    """

    text = " ".join(
        f"{key} {child}"
        for key, child in node.items()
        if key not in {"calculation_kind", "formula"}
        if isinstance(child, (str, int, float)) and child not in ("", None)
    ).strip()
    if not cited_claim_ids:
        return False
    cited_facts = [
        fact
        for claim_id in cited_claim_ids
        for fact in verified_facts_by_claim.get(claim_id, ())
    ]
    material_facts = extract_material_facts(
        text,
        claim_id=path or "prd",
        force_material=True,
        include_text_spans=True,
    )
    if not material_facts or not cited_facts:
        return False

    # A decimal pack size such as ``3,5 kg`` is an observed-offer identity
    # qualifier, not a second price. Suppress it only when that exact canonical
    # pack token is present in a cited, signed observed fact. An invented or
    # changed pack remains material and therefore fails closed.
    observed_pack_tokens = {
        str(term).casefold()
        for fact in cited_facts
        if str(fact.get("evidence_class") or "") == "observed_primary_market"
        for term in fact.get("fact_terms") or []
        if re.fullmatch(
            r"\d+(?:[.,]\d+)?(?:kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)",
            str(term).casefold(),
        )
    }
    observed_facts = [
        fact
        for fact in cited_facts
        if str(fact.get("evidence_class") or "") == "observed_primary_market"
    ]

    cited_pack_spans: list[tuple[int, int]] = []
    for pack_match in re.finditer(
            r"(?<![\w+\-])(\d+(?:[.,]\d+)?)\s*"
            r"(kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\b",
            text,
            re.IGNORECASE,
        ):
        pack_token = re.sub(r"\s+", "", pack_match.group(0)).casefold()
        if pack_token not in observed_pack_tokens:
            continue
        separator = re.match(r"\s*:\s*", text[pack_match.end():])
        if not separator:
            continue
        price_start = pack_match.end() + separator.end()
        price_match = _MATERIAL_VALUE.match(text, price_start)
        if not price_match:
            continue
        raw_price = price_match.group(0).strip().rstrip(".,;:")
        price_unit = _material_unit(raw_price)
        price_value = _normalized_value(raw_price, price_unit)
        if any(
            price_unit == fact.get("unit")
            and _normalized_material_values_equal(
                price_value, fact.get("normalized_value")
            )
            for fact in observed_facts
        ):
            cited_pack_spans.append((pack_match.start(1), pack_match.end(1)))

    def is_cited_pack_qualifier(candidate: Mapping[str, Any]) -> bool:
        if candidate.get("unit") != "number" or not cited_pack_spans:
            return False
        candidate_start = int(candidate.get("_text_start", -1))
        candidate_end = int(candidate.get("_text_end", -1))
        return any(
            candidate_start < span_end and candidate_end > span_start
            for span_start, span_end in cited_pack_spans
        )

    material_facts = [
        fact for fact in material_facts if not is_cited_pack_qualifier(fact)
    ]
    if not material_facts:
        return False

    candidate_temporal, invalid_temporal = _explicit_temporal_references(text)
    candidate_countries, unknown_jurisdiction = _jurisdiction_qualifiers(text)
    candidate_years = {
        match.group(1)
        for match in re.finditer(r"(?<!\d)((?:19|20)\d{2})(?!\d)", text)
    }
    candidate_official_periods: set[tuple[str, str]] = {
        ("year", year) for year in candidate_years
    }
    candidate_official_periods.update(
        {
            ("quarter", f"{year}-Q{q_number or ordinal_number}")
            for q_number, ordinal_number, year in re.findall(
                r"\b(?:Q([1-4])|([1-4])(?:st|nd|rd|th)?\s+quarter)\s+"
                r"((?:19|20)\d{2})\b",
                text,
                re.IGNORECASE,
            )
        }
    )
    for date_match in _DATE_IN_TEXT.finditer(text):
        parsed_date = _parse_date_candidate(date_match.group(0))
        if parsed_date is None:
            continue
        precision, value = parsed_date
        if precision == "day":
            candidate_official_periods.add(("month", value[:7]))
            candidate_official_periods.add(("year", value[:4]))
        elif precision == "month":
            candidate_official_periods.add(("month", value))
            candidate_official_periods.add(("year", value[:4]))

    def topic_signature(
        identity: str,
        *,
        country_codes: Iterable[str] = (),
        identity_terms: Iterable[str] = (),
    ) -> tuple[set[str], set[str]]:
        tokens = set(re.findall(r"[^\W\d_][\w-]{2,}", identity.casefold()))
        categories = tokens & _PRODUCT_CATEGORY_TERMS
        kinds = tokens & _PRODUCT_KIND_TERMS
        normalized_identity = " ".join(identity.casefold().split())
        normalized_terms = {str(term).casefold() for term in identity_terms if term}
        allowed_countries = {str(code).upper() for code in country_codes if code}
        # Only the hash-pinned, code-reviewed topic registry may translate a
        # localized product surface into a canonical category/kind.  Model
        # prose and fuzzy language similarity are never translation authority.
        for alias in trusted_topic_alias_registry().entries:
            if alias.country_code not in allowed_countries:
                continue
            alias_tokens = set(alias.phrase.split())
            alias_pattern = re.escape(alias.phrase).replace(r"\ ", r"\s+")
            exact_surface = bool(
                re.search(
                    rf"(?<!\w){alias_pattern}(?!\w)",
                    normalized_identity,
                    re.IGNORECASE,
                )
            )
            if not exact_surface and not alias_tokens.issubset(normalized_terms):
                continue
            anchor_tokens = set(
                re.findall(r"[^\W\d_][\w-]{2,}", alias.source_anchor.casefold())
            )
            categories.update(anchor_tokens & _PRODUCT_CATEGORY_TERMS)
            kinds.update(anchor_tokens & _PRODUCT_KIND_TERMS)
        return categories, kinds

    def price_basis(identity: str) -> str:
        lowered = identity.casefold()
        if re.search(r"\b(?:sale|promo(?:tional)?|discount(?:ed)?)\b", lowered):
            return "promotion"
        if re.search(r"\b(?:member|loyalty)\b", lowered):
            return "member"
        if re.search(r"\b(?:list|regular)\b", lowered):
            return "list"
        return "baseline"

    def is_localized_catalog_price(candidate: Mapping[str, Any]) -> bool:
        """Recognize only ``<pack>: <currency amount>`` catalogue surfaces."""

        display_value = str(candidate.get("display_value") or "")
        if not display_value:
            return False
        candidate_start = int(candidate.get("_text_start", -1))
        candidate_end = int(candidate.get("_text_end", -1))
        if candidate_start < 0 or candidate_end <= candidate_start:
            return False
        prefix = text[max(0, candidate_start - 48):candidate_start]
        return bool(
            re.search(
                r"(?<![\w+\-])\d+(?:[.,]\d+)?\s*"
                r"(?:kg|mg|g|ml|cl|l|oz|lb|pcs?|pack|units?)\s*:\s*$",
                prefix,
                re.IGNORECASE,
            )
            and text[candidate_start:candidate_end].casefold()
            == display_value.casefold()
        )

    def temporal_matches(verified: Mapping[str, Any]) -> bool:
        if invalid_temporal:
            return False
        scope_parts = _temporal_scope_parts(verified.get("temporal_scope"))
        if candidate_temporal and (
            not scope_parts
            or any(reference not in scope_parts for reference in candidate_temporal)
        ):
            return False
        if str(verified.get("evidence_class") or "") == "official_statistic":
            if candidate_official_periods and (
                not scope_parts
                or not candidate_official_periods.issubset(scope_parts)
            ):
                return False
        return True

    def identity_matches(
        candidate: Mapping[str, Any], verified: Mapping[str, Any]
    ) -> bool:
        candidate_terms = set(candidate.get("fact_terms") or [])
        verified_terms = set(verified.get("fact_terms") or [])
        verified_countries = {
            str(code).upper() for code in verified.get("country_codes") or [] if code
        }
        if unknown_jurisdiction or (
            candidate_countries
            and (
                not verified_countries
                or candidate_countries != verified_countries
            )
        ):
            return False
        candidate_metric = str(candidate.get("metric_key") or "").split(":", 1)[0]
        verified_class = str(verified.get("evidence_class") or "")
        if verified_class == "statutory_current":
            statutory_scope = set(
                re.split(r"[:+]", str(verified.get("semantic_scope") or ""))
            )
            candidate_subtypes = {
                subtype
                for subtype in _STATUTORY_RATE_SUBTYPES
                if re.search(rf"\b{re.escape(subtype)}\b", text, re.IGNORECASE)
            }
            verified_subtypes = statutory_scope & _STATUTORY_RATE_SUBTYPES
            if (
                candidate_subtypes
                and verified_subtypes
                and candidate_subtypes != verified_subtypes
            ):
                return False
            return bool(
                candidate_metric
                and (
                    candidate_metric in statutory_scope
                    or candidate_metric == "effective"
                    and candidate_terms & statutory_scope
                )
            )
        if verified_class == "observed_primary_market":
            exact_metric = candidate.get("metric_key") == verified.get("metric_key")
            localized_price_metric = bool(
                candidate.get("metric_key") == candidate.get("unit")
                and verified.get("metric_key")
                == f"price:{candidate.get('unit')}"
                and is_localized_catalog_price(candidate)
            )
            if not (exact_metric or localized_price_metric):
                return False
            candidate_identity = " ".join(
                [text, " ".join(str(item) for item in candidate_terms)]
            )
            verified_identity = " ".join(
                [
                    str(verified.get("semantic_scope") or ""),
                    " ".join(str(item) for item in verified_terms),
                ]
            )
            candidate_categories, candidate_kinds = topic_signature(
                candidate_identity,
                country_codes=verified_countries,
                identity_terms=candidate_terms,
            )
            verified_categories, verified_kinds = topic_signature(
                verified_identity,
                country_codes=verified_countries,
                identity_terms=verified_terms,
            )
            if candidate_categories != verified_categories and (
                candidate_categories or verified_categories
            ):
                return False
            if candidate_kinds != verified_kinds and (
                candidate_kinds or verified_kinds
            ):
                return False
            if price_basis(candidate_identity) != price_basis(verified_identity):
                return False
            ignored_offer_terms = {
                "are", "current", "eur", "food", "is", "offer", "price",
                "retail", "the", "was",
            }
            candidate_product = candidate_terms - ignored_offer_terms
            verified_product = verified_terms - ignored_offer_terms
            candidate_packs = {
                value for value in candidate_product if re.search(r"\d", value)
            }
            verified_packs = {
                value for value in verified_product if re.search(r"\d", value)
            }
            if verified_packs and candidate_packs != verified_packs:
                return False
            lexical_candidate = candidate_product - candidate_packs
            lexical_verified = verified_product - verified_packs
            return bool(
                lexical_candidate
                and lexical_verified
                and _terms_overlap(lexical_candidate, lexical_verified) >= 0.6
            )
        if candidate.get("metric_key") == verified.get("metric_key"):
            return True
        if verified_class != "official_statistic":
            return False
        verified_identity = " ".join(
            [
                str(verified.get("metric_key") or ""),
                str(verified.get("semantic_scope") or ""),
                " ".join(str(item) for item in verified.get("fact_terms") or []),
            ]
        ).casefold()
        candidate_identity = " ".join(
            [
                str(candidate.get("metric_key") or ""),
                " ".join(str(item) for item in candidate.get("fact_terms") or []),
            ]
        ).casefold()

        def dimensions(identity: str) -> set[str]:
            normalized = re.sub(r"\bper[\s_-]+capita\b", "per_capita", identity)
            result = set()
            for group in _MATERIAL_DIMENSION_GROUPS:
                for value in group:
                    pattern = (
                        r"\bimports?\b" if value == "import"
                        else r"\bexports?\b" if value == "export"
                        else rf"\b{re.escape(value)}\b"
                    )
                    if re.search(pattern, normalized):
                        result.add(value)
            return result

        candidate_dimensions = dimensions(candidate_identity)
        verified_dimensions = dimensions(verified_identity)
        for group in _MATERIAL_DIMENSION_GROUPS:
            candidate_group = candidate_dimensions & set(group)
            verified_group = verified_dimensions & set(group)
            # A signed narrow series cannot authorize a wider paraphrase. Every
            # exclusive dimension present in the verified identity must remain
            # explicit and identical in the PRD statement.
            if verified_group and candidate_group != verified_group:
                return False
        candidate_categories, candidate_kinds = topic_signature(candidate_identity)
        verified_categories, verified_kinds = topic_signature(verified_identity)
        if verified_categories and candidate_categories != verified_categories:
            return False
        if verified_kinds and candidate_kinds != verified_kinds:
            return False
        # Structured observations have dataset/series-specific metric keys.
        # Couple their public PRD paraphrase only when its canonical critical
        # concept is visible in that signed series identity; value alone is
        # never enough.
        return bool(
            candidate_metric
            and re.search(rf"\b{re.escape(candidate_metric)}\b", verified_identity)
            and _terms_overlap(
                candidate.get("fact_terms") or [],
                verified.get("fact_terms") or [],
            )
            >= 0.5
        )

    def candidate_matches_verified(
        candidate: Mapping[str, Any], verified: Mapping[str, Any]
    ) -> bool:
        return bool(
            _normalized_material_values_equal(
                candidate.get("normalized_value"), verified.get("normalized_value")
            )
            and candidate.get("unit") == verified.get("unit")
            and identity_matches(candidate, verified)
            and temporal_matches(verified)
        )

    return all(
        any(candidate_matches_verified(candidate, verified) for verified in cited_facts)
        for candidate in material_facts
    )


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


def _normalized_material_values_equal(left: Any, right: Any) -> bool:
    """Compare canonical numeric identity without display-scale spelling.

    Signed ledgers may serialize ``26.9`` while a PRD preserves the storefront
    display ``26.90``. Decimal equality accepts that representational
    equivalence while the caller still requires an exact unit and fact
    identity; different values, metrics, products, packs, and claims remain
    blocked.
    """

    left_text = str(left or "").strip()
    right_text = str(right or "").strip()
    if left_text == right_text:
        return True
    left_value, left_separator, left_unit = left_text.rpartition(":")
    right_value, right_separator, right_unit = right_text.rpartition(":")
    if not left_separator or not right_separator or left_unit != right_unit:
        return False
    try:
        return Decimal(left_value) == Decimal(right_value)
    except InvalidOperation:
        return False


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
    topic_alias_expansion: Optional[ValidatedTopicAliasExpansion] = None,
    provenance_source_id: str = "",
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
        if (
            not provenance_source_id
            or str(source.get("source_id") or "") != provenance_source_id
        ):
            continue
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
                expansion=topic_alias_expansion,
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
    metric = re.sub(r"[\s\-–—]+", " ", nearest.group(0).casefold()).strip()
    canonical_metrics = {
        "taxes": "tax",
        "duties": "duty",
        "tariffs": "tariff",
        "regulations": "regulation",
        "licenses": "license",
        "licences": "licence",
        "laws": "law",
        "bans": "ban",
        "deadlines": "deadline",
        "prices": "price",
        "costs": "cost",
        "fees": "fee",
        "margins": "margin",
        "pricing": "price",
        "revenues": "revenue",
        "markups": "markup",
        "discounts": "discount",
        "conversion rates": "conversion rate",
        "profits": "profit",
        "market sizes": "market size",
        "growth rates": "growth rate",
        "populations": "population",
        "turnovers": "turnover",
        "consumptions": "consumption",
        "import": "imports",
        "export": "exports",
        "volumes": "volume",
        "currencies": "currency",
        "exchange rates": "exchange rate",
        "minimum wages": "minimum wage",
        "quotas": "quota",
    }
    return f"{canonical_metrics.get(metric, metric)}:{unit}"


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
    force_material: bool = False,
    include_text_spans: bool = False,
) -> List[Dict[str, Any]]:
    """Extract comparable material values without knowing a country in advance."""

    explicit_material_class = evidence_class in {
        "statutory_current",
        "official_statistic",
        "observed_primary_market",
    }
    if not text or (
        not force_material
        and not explicit_material_class
        and not _CRITICAL_TERMS.search(text)
    ):
        return []
    rows: List[Dict[str, Any]] = []
    date_spans = [(match.start(), match.end()) for match in _DATE_IN_TEXT.finditer(text)]
    for index, match in enumerate(_MATERIAL_VALUE.finditer(text)):
        if any(
            match.start() < date_end and match.end() > date_start
            for date_start, date_end in date_spans
        ):
            # Effective/observation dates have their own identity coupling.
            # Never reinterpret a dotted or slash-form date fragment as a
            # price/rate merely because it resembles a decimal.
            continue
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
        row = {
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
        if include_text_spans:
            # Validator-internal coordinates. They are opt-in so durable
            # evidence identities and synthesis payloads never acquire parser
            # implementation details.
            row["_text_start"] = match.start()
            row["_text_end"] = match.end()
        rows.append(row)
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
    topic_market_scope_contract: Optional[Mapping[str, Any]] = None,
    topic_alias_expansion: Optional[Mapping[str, Any]] = None,
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
    raw_topic_scope = (
        topic_market_scope_contract
        or grounding.get("topic_market_scope_contract")
    )
    raw_topic_alias_expansion = (
        topic_alias_expansion
        if topic_alias_expansion is not None
        else grounding.get("topic_alias_expansion")
    )
    validated_topic_seed: Optional[TopicSeedContract] = None
    validated_topic_alias_expansion: Optional[ValidatedTopicAliasExpansion] = None
    topic_contract_status = "not_required"
    if official_topic_required or observed_topic_required:
        topic_contract_status = "missing_or_invalid"
        try:
            candidate_topic_seed = TopicSeedContract.model_validate(raw_topic_seed)
            if requested_countries and not requested_countries.issubset(
                set(candidate_topic_seed.confirmed_country_codes)
            ):
                raise ValueError("topic seed does not cover requested country cells")
            candidate_topic_scope = ConfirmedMarketScope.model_validate(
                raw_topic_scope
            )
            validated_topic_alias_expansion = (
                validate_expected_trusted_topic_alias_expansion(
                    candidate_topic_seed,
                    candidate_topic_scope,
                    raw_topic_alias_expansion,
                )
            )
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
        provenance_source_id = ""
        citation = claim.get("citation_metadata")
        artifact = claim.get("provenance_artifact")
        if isinstance(citation, Mapping) and isinstance(artifact, Mapping):
            citation_source_id = str(citation.get("source_id") or "")
            artifact_source_id = str(artifact.get("source_id") or "")
            if citation_source_id and citation_source_id == artifact_source_id:
                provenance_source_id = citation_source_id
        if evidence_class in {
            "statutory_current",
            "official_statistic",
            "observed_primary_market",
        }:
            direct_authorities = [
                source
                for source in direct_authorities
                if str(source.get("source_id") or "") == provenance_source_id
            ]
            valid_authorities = [
                source
                for source in valid_authorities
                if str(source.get("source_id") or "") == provenance_source_id
            ]
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
                topic_alias_expansion=validated_topic_alias_expansion,
                provenance_source_id=provenance_source_id,
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
        valid_authority_source_ids = {
            str(source.get("source_id") or "") for source in valid_authorities
        }
        matched_commercial_offer = None
        if evidence_class == "observed_primary_market":
            offer_topic_seed: Optional[TopicSeedContract] = None
            if validated_topic_seed is not None:
                direct_product_topics = product_topic_phrases(validated_topic_seed)
                if direct_product_topics:
                    offer_topic_seed = validated_topic_seed
            authorized_fact_ids: set[str] = set()
            for source in linked_sources:
                source_id = str(source.get("source_id") or "")
                if (
                    not provenance_source_id
                    or source_id != provenance_source_id
                    or source_id not in valid_authority_source_ids
                ):
                    continue
                source_topic_contracts: tuple[tuple[str, str], ...] = ()
                source_topic_countries = {
                    str(code).upper()
                    for code in source.get("country_codes") or []
                    if code
                }
                bound_topic_countries = (
                    source_topic_countries & claim_countries & requested_countries
                )
                if offer_topic_seed is not None and len(bound_topic_countries) == 1:
                    try:
                        source_topic_contracts = evidence_topic_phrases_for_country(
                            offer_topic_seed,
                            country_code=next(iter(bound_topic_countries)),
                            expansion=validated_topic_alias_expansion,
                        )
                    except (TypeError, ValueError):
                        source_topic_contracts = ()
                proof = source.get("authority_proof")
                raw_html = source.get("_structured_evidence_html")
                authority_document = source.get("_authority_document_artifact")
                if not isinstance(proof, Mapping) or not isinstance(raw_html, str):
                    continue
                direct_text = (
                    authority_document.get("text")
                    if isinstance(authority_document, Mapping)
                    else None
                )
                if (
                    not raw_html
                    or len(raw_html.encode("utf-8")) > 2_000_000
                    or not isinstance(direct_text, str)
                    or _normalized_document_text(raw_html, is_html=True)
                    != direct_text
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
                        # Topic evidence must be present in the exact signed,
                        # visible claim span. A hidden JSON-LD name must never
                        # lend category identity to a visible SKU/price row.
                        if not any(
                            exact_topic_phrase_in_visible_text(
                                fact_text, phrase
                            )
                            and exact_topic_phrase_in_visible_text(
                                product_name, phrase
                            )
                            for phrase, _source_anchor in source_topic_contracts
                        ):
                            offer = None
                    if offer:
                        signed_product_name = " ".join(
                            str(offer.get("product_name") or "").split()
                        )[:300]
                        if (
                            not signed_product_name
                            or _has_disallowed_identity_codepoint(
                                signed_product_name
                            )
                        ):
                            # A hidden/ID-only or control-bearing offer cannot
                            # support the strict physical-product identity
                            # adapter. Reject it at quality time rather than
                            # guaranteeing a later PRD terminal failure.
                            offer = None
                    if offer:
                        # Currency symbols and separator conventions are not
                        # globally unique. Once the exact fact span is bound to
                        # one signed raw-derived offer, the ledger canonical
                        # value comes from that offer rather than reinterpreting
                        # `$` as USD or `1,299` independently.
                        fact["unit"] = str(offer.get("price_currency") or "").casefold()
                        canonical_price = format(
                            Decimal(str(offer.get("price") or "")), "f"
                        )
                        if not canonical_price:
                            canonical_price = "0"
                        fact["normalized_value"] = (
                            f"{canonical_price}:{fact['unit']}"
                        )
                        # The signed offer is the currency authority. Do not
                        # preserve a parser-derived suffix such as ``number``
                        # (for a symbol the generic fact parser does not map)
                        # or ``usd`` (for an ambiguous dollar sign).
                        fact["metric_key"] = f"price:{fact['unit']}"
                        # The offer name is already raw-derived, visibly bound,
                        # included in the offer SHA, and HMAC-bound by the
                        # direct primary-market authority proof. Preserve it
                        # before the lossy ``fact_terms`` path so downstream
                        # strict identity never relies on a category ontology.
                        fact["signed_offer_product_name"] = signed_product_name
                        if offer_topic_seed is not None:
                            fact["topic_seed_sha256"] = (
                                offer_topic_seed.seed_sha256
                            )
                        offer_identity_hash = hashlib.sha256(
                            json.dumps(
                                {
                                    "product_id": offer.get("product_id") or "",
                                    "product_name": offer.get("product_name") or "",
                                },
                                sort_keys=True,
                                separators=(",", ":"),
                                ensure_ascii=False,
                            ).encode("utf-8")
                        ).hexdigest()[:16]
                        denominator_match = re.search(
                            r"^\s*(?:/|\bper\s+)(kg|g|l|ml|pcs?|piece|unit|item)\b",
                            fact_text[
                                fact_text.find(str(fact.get("display_value") or ""))
                                + len(str(fact.get("display_value") or "")) :
                            ],
                            re.IGNORECASE,
                        )
                        denominator = (
                            denominator_match.group(1).casefold()
                            if denominator_match
                            else "item"
                        )
                        fact["semantic_scope"] = (
                            f"catalog:signed_offer:{offer_identity_hash}:"
                            f"per_{denominator}:{fact['unit']}"
                        )
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
            if _same_fact(left, right) and not _normalized_material_values_equal(
                left["normalized_value"], right["normalized_value"]
            ):
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
        # This is copied from the server-owned acquisition scope passed into
        # critical-claim evaluation. Typed calculations cross-check it against
        # both the PRD's explicit ISO scope and the signed fact jurisdictions.
        "requested_country_codes": sorted(requested_countries),
        "topic_contract_status": topic_contract_status,
        "topic_seed_sha256": (
            validated_topic_seed.seed_sha256 if validated_topic_seed else None
        ),
        "topic_alias_expansion_sha256": (
            validated_topic_alias_expansion.expansion_sha256
            if validated_topic_alias_expansion
            else None
        ),
        "topic_alias_registry_id": (
            validated_topic_alias_expansion.trusted_registry_id
            if validated_topic_alias_expansion
            else None
        ),
        "topic_alias_registry_version": (
            validated_topic_alias_expansion.trusted_registry_version
            if validated_topic_alias_expansion
            else None
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
        allowed_top_level = {"prd_type", "commercial_prd", "metadata"}
        unexpected_top_level = sorted(
            str(key) for key in set(content) - allowed_top_level
        )
        if content.get("prd_type") != COMMERCIAL_MARKET_LAUNCH:
            issues.append(
                {
                    "code": "commercial_prd_type_invalid",
                    "message": (
                        f"prd_type must be exactly {COMMERCIAL_MARKET_LAUNCH}."
                    ),
                }
            )
        for key in unexpected_top_level:
            issues.append(
                {
                    "code": "commercial_top_level_key_invalid",
                    "message": f"Unexpected top-level commercial PRD key: {key}",
                }
            )
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
            for key in sorted(str(key) for key in set(commercial) - required):
                issues.append(
                    {
                        "code": "commercial_section_unexpected",
                        "message": f"Unexpected commercial PRD section: {key}",
                    }
                )
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
        if isinstance(row, Mapping)
        and row.get("claim_id")
        and str(row.get("status") or "") in _CITABLE_EVIDENCE_STATUSES
    }
    ledger_facts_by_claim: Dict[str, List[Mapping[str, Any]]] = {}
    for row in quality.get("evidence_ledger") or []:
        if (
            not isinstance(row, Mapping)
            or not row.get("claim_id")
            or str(row.get("status") or "") not in _CITABLE_EVIDENCE_STATUSES
        ):
            continue
        claim_id = str(row["claim_id"])
        ledger_facts_by_claim[claim_id] = [
            fact
            for fact in row.get("facts") or []
            if isinstance(fact, Mapping) and fact.get("identity_complete") is True
        ]
    verified_facts_by_claim = {
        claim_id: list(facts) for claim_id, facts in ledger_facts_by_claim.items()
    }
    # Compatibility callers may supply verified_facts separately. Fact
    # ownership still comes from each fact's immutable claim_id.
    for fact in verified:
        if (
            not isinstance(fact, Mapping)
            or not fact.get("claim_id")
            or fact.get("identity_complete") is not True
            or str(fact.get("claim_id")) not in verified_claim_ids
        ):
            continue
        claim_id = str(fact["claim_id"])
        bucket = verified_facts_by_claim.setdefault(claim_id, [])
        if fact not in bucket:
            bucket.append(fact)
    if semantic_type == COMMERCIAL_MARKET_LAUNCH and isinstance(
        content.get("commercial_prd"), Mapping
    ):
        commercial = content["commercial_prd"]
        declared_market_countries = _strict_market_country_codes(
            commercial.get("market_scope")
        )
        raw_immutable_countries = quality.get("requested_country_codes")
        immutable_market_countries = (
            None
            if raw_immutable_countries is None
            else _strict_iso_country_code_values(raw_immutable_countries)
        )
        formula_market_countries = (
            declared_market_countries
            if declared_market_countries
            and (
                immutable_market_countries is None
                or immutable_market_countries == declared_market_countries
            )
            else set()
        )
        raw_topic_seed_sha256 = quality.get("topic_seed_sha256")
        formula_topic_seed_sha256 = (
            str(raw_topic_seed_sha256)
            if isinstance(raw_topic_seed_sha256, str)
            and re.fullmatch(r"[a-f0-9]{64}", raw_topic_seed_sha256)
            else ""
        )
        issues.extend(
            _reviewed_observed_sku_contract_issues(
                commercial,
                ledger_facts_by_claim,
                formula_market_countries,
                formula_topic_seed_sha256,
            )
        )
        for path, node in _iter_material_nodes(commercial):
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
            if hypothesis and validation_plan and not cited and not inputs:
                traceable = True
            else:
                fact_claim_ids = cited | inputs
                typed_formula_valid = bool(
                    formula
                    and path
                    == "pricing_and_unit_economics.observed_pack_price_difference"
                    and _formula_has_typed_bindings(
                        node,
                        verified_claim_ids=verified_claim_ids,
                        verified_facts_by_claim=ledger_facts_by_claim,
                        required_country_codes=formula_market_countries,
                        required_topic_seed_sha256=formula_topic_seed_sha256,
                    )
                )
                structurally_cited = bool(
                    cited
                    and cited.issubset(verified_claim_ids)
                    or typed_formula_valid
                )
                strict_signed_offer_path = _path_requires_strict_signed_offer(
                    path, cited, ledger_facts_by_claim
                )
                exact_signed_offer = bool(
                    structurally_cited
                    and strict_signed_offer_path
                    and _path_scoped_signed_offer_matches(
                        node,
                        path=path,
                        cited_claim_ids=cited,
                        ledger_facts_by_claim=ledger_facts_by_claim,
                        required_country_codes=formula_market_countries,
                        required_topic_seed_sha256=formula_topic_seed_sha256,
                    )
                )
                traceable = bool(
                    typed_formula_valid
                    or exact_signed_offer
                    or structurally_cited
                    and not strict_signed_offer_path
                    and _material_facts_match_cited_evidence(
                        node,
                        path=path,
                        cited_claim_ids=fact_claim_ids,
                        verified_facts_by_claim=verified_facts_by_claim,
                    )
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
        pricing = commercial.get("pricing_and_unit_economics")
        if not _has_traceable_calculation(
            pricing,
            verified_claim_ids,
            ledger_facts_by_claim,
            formula_market_countries,
            formula_topic_seed_sha256,
        ):
            issues.append(
                {
                    "code": "traceable_unit_economics_missing",
                    "message": (
                        "Pricing and unit economics must contain at least one formula "
                        "with exact input_claim_ids and input_bindings to verified "
                        "ledger fact IDs. With two compatible signed offers, use "
                        "the exact pricing_and_unit_economics child key "
                        "observed_pack_price_difference, calculation_kind "
                        "observed_pack_price_difference, and exactly: "
                        "observed_pack_price_difference = higher_observed_pack_price "
                        "- lower_observed_pack_price. The formula object must contain "
                        "only calculation_kind, formula, input_claim_ids, and "
                        "input_bindings; keep the higher bound fact in the exact "
                        "higher_observed_benchmark_pack sibling and the lower bound "
                        "fact in lower_observed_benchmark_pack, and do not display "
                        "the derived result."
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
            if _same_fact(candidate, fact) and not _normalized_material_values_equal(
                candidate["normalized_value"], fact["normalized_value"]
            ):
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
