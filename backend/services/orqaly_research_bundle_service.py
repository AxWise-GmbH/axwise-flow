"""Grounded market evidence and portable result bundles for Orqaly research runs."""

from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Literal, Mapping, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, model_validator

from backend.api.research.simulation_bridge.models import (
    CompanyDiscoveryItem,
    SimulationRequest,
    SimulationResponse,
)
from backend.domain.market_scope import research_cells
from backend.domain.orchestration.models import BusinessEvidenceProfileV1
from backend.services.business_evidence_contract_service import (
    BUNDLE_VERSION as BUSINESS_EVIDENCE_BUNDLE_VERSION,
    build_business_evidence_contract_v1,
    validate_business_evidence_contract_v1,
)
from backend.services.business_evidence_projection_service import (
    configured_business_evidence_projection_models,
    project_business_evidence_facts,
    require_enabled_business_evidence_projection,
)
from backend.services.orqaly_persona_resolution_service import (
    is_customer_persona_eligible,
)
from backend.services.research_source_authority_service import validate_authority_proof


BUNDLE_VERSION = "axwise_research_bundle_v1"
GROUNDING_COMPOSER_VERSION = "adaptive_market_cells_gemini_searxng_registry_v2"
MAX_RESEARCH_BUNDLE_BYTES = 8 * 1024 * 1024
_URL_PATTERN = re.compile(r"https?://[^\s<>\]\[\)\(\"']+", re.IGNORECASE)

# Required capabilities may describe methods, tools, or subject matter; they
# must not each become an executor persona. Orqaly can send authoritative roles
# separately. This exact alias catalogue only preserves compatibility with its
# established commercial-agent vocabulary.
_EXECUTOR_ROLE_ALIASES: Dict[str, tuple[str, ...]] = {
    "Marketing ICP Research": (
        "marketing icp research",
        "marketing icp",
        "marketing icp specialist",
        "marketing strategist",
        "market strategist",
        "german market localization specialist",
        "bremen specialist",
    ),
    "Finance Pricing": (
        "finance pricing",
        "finance pricing specialist",
        "finance specialist",
        "commercial pricing analyst",
        "pricing analyst",
    ),
    "GDPR Legal Compliance": (
        "gdpr legal compliance",
        "gdpr legal compliance specialist",
        "eu regulatory and gdpr compliance lead",
        "eu regulatory gdpr compliance lead",
        "gdpr compliance lead",
        "legal compliance",
        "lawyer",
    ),
    "Business Development Sales": (
        "business development sales",
        "business development sales specialist",
        "business development manager",
        "b2b go to market strategist",
        "go to market strategist",
        "sales manager",
        "sales strategist",
    ),
    "Commercial Risk": (
        "commercial risk",
        "commercial risk analyst",
        "commercial risk manager",
        "commercial risk analysis",
        "risk manager",
        "risk matrix specialist",
    ),
}
_NON_EXECUTION_ROLE_KEYS = {
    "coordinator",
    "generalist",
    "project coordinator",
    "qa tester",
    "qa specialist",
    "quality assurance",
    "quality assurance specialist",
    "team lead",
    "team coordinator",
}
_EXECUTOR_ROLE_PLAYBOOKS: Dict[str, Dict[str, Any]] = {
    "Marketing ICP Research": {
        "mission_focus": "Define evidence-backed customer segments for the authorized market scope.",
        "expertise": [
            "ideal-customer-profile segmentation",
            "jobs-to-be-done and buying-trigger research",
            "country and regional market localization",
            "buyer-role and qualification-rule design",
        ],
        "methods": [
            "Triangulate persona evidence, market sources, and explicit assumptions.",
            "Separate pains, triggers, buyer roles, disqualifiers, and observable fit signals.",
            "Compare segments with a consistent evidence and commercial-attractiveness rubric.",
        ],
        "decision_lens": [
            "Is the segment specific enough to target and disqualify?",
            "Does each material assertion trace to a source, interview, or labeled hypothesis?",
            "Does localization reflect the authorized markets without flattening country differences or stereotyping?",
        ],
        "outputs": [
            "Prioritized ICP profiles with pains, triggers, buyer roles, and qualification rules.",
            "Evidence map linking each segment decision to research identifiers.",
            "Open questions and falsification tests for weak assumptions.",
        ],
        "risks": [
            "Over-broad segments that cannot guide outreach.",
            "Treating synthetic interviews as measured market prevalence.",
            "Inventing local facts absent from the grounded source bundle.",
        ],
    },
    "Finance Pricing": {
        "mission_focus": "Turn customer value and delivery constraints into defensible market-specific offers.",
        "expertise": [
            "commercial package architecture",
            "value, cost, and margin assumption modelling",
            "scope and exclusion design",
            "pricing sensitivity and proof-point analysis",
        ],
        "methods": [
            "Model scope, delivery effort, risk buffer, and value assumptions separately.",
            "Stress-test package economics across conservative and target scenarios.",
            "Mark every unobserved price or willingness-to-pay input as a field-test hypothesis.",
        ],
        "decision_lens": [
            "Is each price coherent with the market currency, tax context, scope, and exclusions?",
            "Can a buyer understand the value and proof required to justify the package?",
            "Are margin, tax, procurement, and delivery-risk assumptions explicit?",
        ],
        "outputs": [
            "Market-specific packages with currency, scope, exclusions, assumptions, and proof points.",
            "Unit-economics and sensitivity table with decision thresholds.",
            "Pricing validation questions for real customer conversations.",
        ],
        "risks": [
            "False precision from synthetic willingness-to-pay evidence.",
            "Unbounded scope hidden behind a fixed price.",
            "Prices presented as market facts without cited observations.",
        ],
    },
    "GDPR Legal Compliance": {
        "mission_focus": "Design a compliant commercial and delivery framework for every authorized market.",
        "expertise": [
            "EU GDPR role and lawful-basis analysis",
            "data minimization, retention, and purpose limitation",
            "controller, processor, and subprocessor boundaries",
            "DPIA, transfer, consent, and data-subject-right risk identification",
        ],
        "methods": [
            "Map each data flow to purpose, actor, data category, lawful basis, and retention rule.",
            "Identify decisions requiring qualified counsel or a data-protection officer.",
            "Translate compliance controls into package scope, exclusions, and operating steps.",
        ],
        "decision_lens": [
            "Is personal data necessary and proportionate for the stated purpose?",
            "Are applicable national, regional, and cross-border duties explicit for each market?",
            "Is legal uncertainty escalated instead of represented as legal advice?",
        ],
        "outputs": [
            "GDPR-safe delivery framework and data-flow control checklist.",
            "Legal/compliance risk register with owner and escalation trigger.",
            "Required notices, agreements, evidence, and counsel-review points.",
        ],
        "risks": [
            "Presenting a synthetic profile as qualified legal counsel.",
            "Assuming lawful basis, consent, or international-transfer safeguards.",
            "Collecting personal data not needed for delivery or measurement.",
        ],
    },
    "Business Development Sales": {
        "mission_focus": "Convert selected customer segments into measurable, localized market motions.",
        "expertise": [
            "localized business development",
            "multi-channel outbound cadence design",
            "buyer-role messaging and objection handling",
            "pipeline qualification and CRM handoff",
        ],
        "methods": [
            "Map each message and channel to a researched pain, trigger, buyer role, and next step.",
            "Adapt language, register, channels, and permission-aware follow-up to each market.",
            "Define weekly activity, response, meeting, qualification, and handoff targets.",
        ],
        "decision_lens": [
            "Is the outreach relevant to the selected persona rather than generic volume messaging?",
            "Can every claim and proof point be substantiated?",
            "Are opt-out, channel, contact-data, and CRM handling boundaries respected?",
        ],
        "outputs": [
            "Localized outreach cadence with channels, templates, and weekly targets.",
            "Role-specific objection responses and qualification prompts.",
            "CRM stage, handoff, and experiment-tracking specification.",
        ],
        "risks": [
            "Generic or culturally tone-deaf outreach.",
            "Unsubstantiated performance or customer claims.",
            "Contact-data use that conflicts with the approved GDPR framework.",
        ],
    },
    "Commercial Risk": {
        "mission_focus": "Make the multi-market commercial plan measurable, falsifiable, and resilient.",
        "expertise": [
            "commercial funnel and KPI architecture",
            "risk identification, scoring, and mitigation ownership",
            "leading-indicator and experiment design",
            "assumption, dependency, and control mapping",
        ],
        "methods": [
            "Trace funnel stages from reachable account through qualified commercial outcome.",
            "Define numerator, denominator, source system, owner, cadence, and threshold per KPI.",
            "Score risks by likelihood and impact, then assign prevention, detection, and response controls.",
        ],
        "decision_lens": [
            "Can the team tell whether the plan works before budget or time is exhausted?",
            "Are assumptions separated from observed baseline data?",
            "Does every material risk have an owner, trigger, mitigation, and contingency?",
        ],
        "outputs": [
            "Conversion funnel and KPI measurement specification.",
            "Commercial risk matrix with owners, triggers, mitigations, and contingencies.",
            "Decision thresholds for continue, change, or stop actions.",
        ],
        "risks": [
            "Vanity metrics without decision thresholds.",
            "Synthetic results represented as an operating baseline.",
            "Risks listed without accountable controls or monitoring cadence.",
        ],
    },
}


class HybridResearchMode(str, Enum):
    """Research modes accepted by the durable Orqaly A+B contract."""

    GROUNDED_HYBRID = "grounded_hybrid"
    SYNTHETIC_ONLY = "synthetic_only"


class HybridGroundingPolicy(BaseModel):
    """Bounded policy for regional market grounding before simulation."""

    required: bool = True
    research_required: bool = False
    requested_mode: Literal[
        "instant", "grounded_fast", "grounded_deep", "auto"
    ] = "instant"
    fail_closed: bool = True
    source_strategy: str = Field(default="hybrid", pattern="^(hybrid|registry|web)$")
    minimum_structured_sources: int = Field(default=1, ge=1, le=25)
    maximum_sources: int = Field(default=25, ge=1, le=100)
    maximum_claims: int = Field(default=50, ge=1, le=200)
    allowed_source_types: List[
        Literal[
            "company_registry",
            "google_search_result",
            "official_company_website",
            "provided_document",
        ]
    ] = Field(
        default_factory=lambda: [
            "company_registry",
            "google_search_result",
            "official_company_website",
        ],
        min_length=1,
        max_length=4,
    )

    @model_validator(mode="after")
    def validate_fail_closed(self) -> "HybridGroundingPolicy":
        if self.required and not self.fail_closed:
            raise ValueError("required grounding must fail closed")
        return self


GroundingCollector = Callable[
    [SimulationRequest, HybridGroundingPolicy], Awaitable[Dict[str, Any]]
]


def _utf16_sort_key(value: str) -> bytes:
    """Match JavaScript Array.sort/Object.keys ordering for Unicode keys."""

    return value.encode("utf-16-be", errors="surrogatepass")


def _js_object_key_sort(value: str) -> tuple[int, Any]:
    """Mirror JSON.stringify's integer-index ordering after key sorting."""

    if value == "0":
        return 0, 0
    if value.isascii() and value.isdigit() and not value.startswith("0"):
        index = int(value)
        if 0 <= index < 4_294_967_295:
            return 0, index
    return 1, _utf16_sort_key(value)


def _js_number_string(value: float) -> str:
    """Format a finite Python double using JSON.stringify number thresholds."""

    if not math.isfinite(value):
        raise ValueError("Research bundle cannot contain non-finite numbers")
    if value == 0:
        return "0"

    rendered = repr(value).lower()
    if "e" not in rendered:
        return rendered[:-2] if rendered.endswith(".0") else rendered
    mantissa, raw_exponent = rendered.split("e", 1)
    exponent = int(raw_exponent)
    negative = mantissa.startswith("-")
    unsigned = mantissa[1:] if negative else mantissa
    digits = unsigned.replace(".", "")
    integer_digits = unsigned.find(".")
    if integer_digits < 0:
        integer_digits = len(unsigned)
    decimal_position = integer_digits + exponent

    # ECMAScript emits ordinary decimal notation for [1e-6, 1e21).
    if -6 <= exponent < 21:
        if decimal_position <= 0:
            ordinary = "0." + ("0" * -decimal_position) + digits
        elif decimal_position >= len(digits):
            ordinary = digits + ("0" * (decimal_position - len(digits)))
        else:
            ordinary = digits[:decimal_position] + "." + digits[decimal_position:]
        return ("-" if negative else "") + ordinary

    normalized_mantissa = unsigned.rstrip("0").rstrip(".")
    exponent_text = f"+{exponent}" if exponent >= 0 else str(exponent)
    return ("-" if negative else "") + normalized_mantissa + "e" + exponent_text


def canonical_json_string(value: Any) -> str:
    """Serialize exactly like recursively key-sorted JavaScript JSON.stringify."""

    if isinstance(value, Enum):
        return canonical_json_string(value.value)
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        if abs(value) > 9_007_199_254_740_991:
            raise ValueError("Research bundle integer exceeds JavaScript safe range")
        return str(value)
    if isinstance(value, float):
        return _js_number_string(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json_string(item) for item in value) + "]"
    if isinstance(value, dict):
        normalized = {str(key): child for key, child in value.items()}
        entries = (
            canonical_json_string(key) + ":" + canonical_json_string(normalized[key])
            for key in sorted(normalized, key=_js_object_key_sort)
        )
        return "{" + ",".join(entries) + "}"
    if hasattr(value, "model_dump"):
        return canonical_json_string(value.model_dump(mode="json"))
    raise TypeError(f"Research bundle contains unsupported type: {type(value).__name__}")


def canonical_hash(value: Any) -> str:
    """Return SHA-256 over recursively sorted ECMAScript JSON."""

    payload = canonical_json_string(value)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _safe_text(value: Any, limit: int = 1000) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = " ".join(value.replace("\x00", " ").split()).strip()
    return normalized[:limit] or None


def _real_url(value: Any) -> Optional[str]:
    text = _safe_text(value, 2048)
    if not text:
        return None
    match = _URL_PATTERN.search(text)
    if not match:
        return None
    url = match.group(0).rstrip(".,;:")
    parsed = urlparse(url)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    return url


def _stable_id(prefix: str, value: Any) -> str:
    return f"{prefix}-{canonical_hash(value)[:20]}"


def _source_for_registry(company: CompanyDiscoveryItem) -> Optional[Dict[str, Any]]:
    number = _safe_text(company.register_number, 160)
    if not number:
        return None
    registry = {
        "register_number": number,
        "register_court": _safe_text(company.register_court, 255),
        "legal_form": _safe_text(company.legal_form, 120),
    }
    identity = {
        "source_type": "company_registry",
        "company_id": _safe_text(company.id, 255),
        "company_name": _safe_text(company.name, 500),
        "market_location": _safe_text(company.location, 500),
        "registry": registry,
    }
    return {
        "source_id": _stable_id("source", identity),
        **identity,
        "title": f"German company registry {number}",
        "url": None,
        "publisher": "Handelsregister/OpenRegister",
        "source_authority": "official_registry",
    }


def _source_for_url(
    company: CompanyDiscoveryItem,
    raw_value: Any,
    source_type: str,
    title: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    url = _real_url(raw_value)
    if not url:
        return None
    raw_title = _safe_text(raw_value, 800) or ""
    if not title and raw_title:
        title = raw_title.split(url, 1)[0].rstrip(" :-")
    identity = {
        "source_type": source_type,
        "url": url,
        "company_id": _safe_text(company.id, 255),
        "company_name": _safe_text(company.name, 500),
        "market_location": _safe_text(company.location, 500),
    }
    hostname = (urlparse(url).hostname or "").casefold()
    if source_type == "official_company_website":
        authority = "official_company"
    elif (
        hostname.endswith(".gov")
        or ".gov." in hostname
        or hostname.endswith(".europa.eu")
        or hostname == "europa.eu"
    ):
        authority = "official_public"
    else:
        authority = "independent_web"
    return {
        "source_id": _stable_id("source", identity),
        **identity,
        "title": _safe_text(title, 500) or _safe_text(company.name, 500) or url,
        "publisher": urlparse(url).hostname,
        "registry": None,
        "source_authority": authority,
    }


def normalize_market_grounding(
    companies: Iterable[CompanyDiscoveryItem],
    policy: HybridGroundingPolicy,
) -> Dict[str, Any]:
    """Project live regional records into bounded, structured sources and claims."""

    sources_by_key: Dict[str, Dict[str, Any]] = {}
    company_source_ids: Dict[str, List[str]] = {}
    company_rows: List[CompanyDiscoveryItem] = []
    for company in companies:
        company_rows.append(company)
        candidates: List[Optional[Dict[str, Any]]] = [
            _source_for_registry(company),
            _source_for_url(
                company,
                company.website,
                "official_company_website",
                f"Official website for {company.name}",
            ),
        ]
        for value in company.pain_point_sources or []:
            candidates.append(_source_for_url(company, value, "google_search_result"))
        for candidate in candidates:
            if not candidate or len(sources_by_key) >= policy.maximum_sources:
                continue
            if candidate["source_type"] not in policy.allowed_source_types:
                continue
            key = candidate["source_id"]
            existing = sources_by_key.get(str(key))
            if existing:
                source_id = existing["source_id"]
            else:
                sources_by_key[str(key)] = candidate
                source_id = candidate["source_id"]
            company_source_ids.setdefault(str(company.id), []).append(source_id)

    sources = list(sources_by_key.values())
    claims: List[Dict[str, Any]] = []

    def add_claim(
        company: CompanyDiscoveryItem,
        claim_type: str,
        predicate: str,
        value: Any,
    ) -> None:
        source_ids = list(dict.fromkeys(company_source_ids.get(str(company.id), [])))
        object_value = _safe_text(value, 1000)
        subject = _safe_text(company.name, 500)
        if (
            not source_ids
            or not subject
            or not object_value
            or len(claims) >= policy.maximum_claims
        ):
            return
        body = {
            "claim_type": claim_type,
            "subject": subject,
            "predicate": predicate,
            "object": object_value,
            "source_ids": source_ids,
            "verification_status": "source_associated_not_independently_verified",
        }
        claims.append({"claim_id": _stable_id("claim", body), **body})

    for company in company_rows:
        add_claim(company, "market_presence", "operates_in", company.location)
        add_claim(company, "industry_classification", "has_industry", company.industry)
        add_claim(company, "company_size", "has_reported_size", company.size)
        if company.register_number:
            add_claim(
                company,
                "registry_identity",
                "has_register_number",
                company.register_number,
            )
        if company.website:
            add_claim(company, "official_website", "has_website", _real_url(company.website))

    return {
        "market_sources": sources,
        "market_claims": claims,
        "company_count": len(company_rows),
        "structured_source_count": len(sources),
        "claim_count": len(claims),
        "composer_version": GROUNDING_COMPOSER_VERSION,
    }


def valid_structured_market_sources(
    grounding: Dict[str, Any], policy: HybridGroundingPolicy
) -> List[Dict[str, Any]]:
    """Accept only bounded source types with a concrete registry record or URL."""

    valid: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for source in grounding.get("market_sources") or []:
        if not isinstance(source, dict):
            continue
        source_id = _safe_text(source.get("source_id"), 255)
        source_type = _safe_text(source.get("source_type"), 80)
        if (
            not source_id
            or source_id in seen_ids
            or source_type not in policy.allowed_source_types
        ):
            continue
        if source_type == "company_registry":
            registry = source.get("registry")
            concrete = isinstance(registry, dict) and bool(
                _safe_text(registry.get("register_number"), 160)
            )
        elif source_type == "provided_document":
            concrete = bool(_safe_text(source.get("content_hash"), 128))
        else:
            concrete = bool(_real_url(source.get("url")))
        if not concrete:
            continue
        valid.append(source)
        seen_ids.add(source_id)
        if len(valid) >= policy.maximum_sources:
            break
    return valid


async def collect_regional_grounding(
    request: SimulationRequest,
    policy: HybridGroundingPolicy,
) -> Dict[str, Any]:
    """Ground one or many confirmed market cells with bounded concurrency."""

    context = request.business_context
    if not context:
        return normalize_market_grounding([], policy)
    if policy.allowed_source_types == ["provided_document"]:
        return normalize_market_grounding([], policy)

    scope = context.market_scope
    country_cells = (
        [
            cell
            for cell in research_cells(scope)
            if cell.get("cell_id", "").startswith("country:")
        ]
        if scope
        else []
    )
    per_cell_minimum = (
        3
        if policy.requested_mode == "grounded_deep"
        else policy.minimum_structured_sources
    )
    per_cell_authoritative_minimum = 1 if policy.requested_mode == "grounded_deep" else 0
    country_cells = [
        {
            **cell,
            "minimum_structured_sources": per_cell_minimum,
            "minimum_authoritative_sources": per_cell_authoritative_minimum,
        }
        for cell in country_cells
    ]
    if not country_cells:
        if not _safe_text(context.location, 255):
            return normalize_market_grounding([], policy)
        return await _collect_single_market_grounding(request, policy)

    if scope.confirmation.required and not scope.confirmation.confirmed:
        raise ValueError("multi-market grounding requires a confirmed market scope")

    try:
        configured_parallel = int(os.getenv("AXWISE_MARKET_CELL_CONCURRENCY", "6"))
    except ValueError:
        configured_parallel = 6
    maximum_parallel = max(1, min(configured_parallel, 8))
    semaphore = asyncio.Semaphore(maximum_parallel)

    async def collect_cell(cell: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            locality = next(iter(cell.get("localities") or []), None)
            location = ", ".join(
                value for value in [locality, cell.get("country_name")] if value
            )
            cell_request = request.model_copy(
                update={
                    "business_context": context.model_copy(
                        update={"location": location, "market_scope": None}
                    )
                }
            )
            result = await _collect_single_market_grounding(cell_request, policy)
            cell_id = cell["cell_id"]
            country_codes = list(cell.get("country_codes") or [])
            for row in result.get("market_sources") or []:
                row["research_cell_ids"] = [cell_id]
                row["country_codes"] = country_codes
            for row in result.get("market_claims") or []:
                row["research_cell_ids"] = [cell_id]
                row["country_codes"] = country_codes
            source_count = len(result.get("market_sources") or [])
            authoritative_source_count = sum(
                1
                for row in result.get("market_sources") or []
                if row.get("source_type")
                in {"company_registry", "official_company_website"}
                or row.get("source_authority") in {"official_registry", "official_public", "academic"}
            )
            result["cell_coverage"] = {
                "cell_id": cell_id,
                "country_codes": country_codes,
                "source_count": source_count,
                "authoritative_source_count": authoritative_source_count,
                "claim_count": len(result.get("market_claims") or []),
                "minimum_structured_sources": cell["minimum_structured_sources"],
                "minimum_authoritative_sources": cell["minimum_authoritative_sources"],
                "status": (
                    "complete"
                    if source_count >= cell["minimum_structured_sources"]
                    and authoritative_source_count
                    >= cell["minimum_authoritative_sources"]
                    else "blocked"
                ),
            }
            return result

    results = await asyncio.gather(*(collect_cell(cell) for cell in country_cells))

    def common_topic_contract(key: str) -> Any:
        values = [result.get(key) for result in results]
        present = [value for value in values if value is not None]
        if not present:
            return None
        first = present[0]
        if len(present) != len(values) or any(value != first for value in present[1:]):
            raise ValueError(
                f"multi-market grounding returned inconsistent {key} contracts"
            )
        return first

    maximum_sources = min(100, max(policy.maximum_sources, len(country_cells) * 5))
    maximum_claims = min(200, max(policy.maximum_claims, len(country_cells) * 10))
    merge_policy = policy.model_copy(
        update={"maximum_sources": maximum_sources, "maximum_claims": maximum_claims}
    )
    sources, claims = _merge_market_evidence(
        [row for result in results for row in result.get("market_sources") or []],
        [row for result in results for row in result.get("market_claims") or []],
        merge_policy,
    )
    coverage = [result["cell_coverage"] for result in results]
    cell_routing = [
        result.get("routing_diagnostics") or {} for result in results
    ]
    evidence_class_acquisition: Dict[str, Dict[str, int]] = {}
    for routing in cell_routing:
        for evidence_class, counts in (
            routing.get("evidence_class_acquisition") or {}
        ).items():
            aggregate = evidence_class_acquisition.setdefault(
                str(evidence_class),
                {"attempted": 0, "retrieved": 0, "verified": 0, "claim_extracted": 0},
            )
            if not isinstance(counts, dict):
                continue
            for metric in aggregate:
                aggregate[metric] += int(counts.get(metric) or 0)

    def aggregate_stage(key: str) -> Dict[str, Any]:
        rows = [routing.get(key) for routing in cell_routing]
        rows = [row for row in rows if isinstance(row, dict)]
        if not rows:
            return {}
        statuses = {str(row.get("status") or "unknown") for row in rows}
        return {
            "status": next(iter(statuses)) if len(statuses) == 1 else "mixed",
            "cell_count": len(rows),
            "host_count": sum(int(row.get("host_count") or 0) for row in rows),
            "route_count": sum(int(row.get("route_count") or 0) for row in rows),
            "candidate_count": sum(int(row.get("candidate_count") or 0) for row in rows),
            "retrieved_count": sum(int(row.get("retrieved_count") or 0) for row in rows),
            "verified_count": sum(int(row.get("verified_count") or 0) for row in rows),
            "accepted_verified_claims": sum(
                int(row.get("accepted_verified_claims") or 0) for row in rows
            ),
            "source_count": sum(int(row.get("source_count") or 0) for row in rows),
            "company_count": sum(int(row.get("company_count") or 0) for row in rows),
            "elapsed_ms": max(int(row.get("elapsed_ms") or 0) for row in rows),
            "deadline_ms": max(int(row.get("deadline_ms") or 0) for row in rows),
        }

    diagnostics = {
        "requested_location": scope.raw_input,
        "market_scope_hash": scope.resolution_hash,
        "country_codes": [
            country.country_code for country in scope.resolved_scope.countries
        ],
        "cell_concurrency": maximum_parallel,
        "providers": [
            provider
            for routing in cell_routing
            for provider in routing.get("providers") or []
        ],
        "required_evidence_classes": list(
            dict.fromkeys(
                value
                for routing in cell_routing
                for value in routing.get("required_evidence_classes") or []
            )
        ),
        "attempted_sources": [
            source
            for routing in cell_routing
            for source in routing.get("attempted_sources") or []
        ][:24],
        "evidence_class_acquisition": evidence_class_acquisition,
        "authority_resolution": aggregate_stage("authority_resolution"),
        "targeted_authority_attestation": aggregate_stage(
            "targeted_authority_attestation"
        ),
        "targeted_authority_resolution": aggregate_stage(
            "targeted_authority_resolution"
        ),
        "statutory_recovery": aggregate_stage("statutory_recovery"),
        "company_structuring": aggregate_stage("company_structuring"),
        "cells": coverage,
    }
    return {
        "market_sources": sources,
        "market_claims": claims,
        "structured_source_count": len(sources),
        "claim_count": len(claims),
        "company_count": sum(int(result.get("company_count") or 0) for result in results),
        "composer_version": "multi_market_cells_v2",
        "market_scope": scope.model_dump(mode="json"),
        "research_cells": country_cells,
        "cell_coverage": coverage,
        "routing_diagnostics": diagnostics,
        "topic_seed_contract": common_topic_contract("topic_seed_contract"),
        "topic_market_scope_contract": common_topic_contract(
            "topic_market_scope_contract"
        ),
        "topic_alias_expansion": common_topic_contract(
            "topic_alias_expansion"
        ),
        "_deferred_company_enrichment": [
            entry
            for result in results
            for entry in result.get("_deferred_company_enrichment") or []
        ],
    }


async def _collect_single_market_grounding(
    request: SimulationRequest,
    policy: HybridGroundingPolicy,
) -> Dict[str, Any]:
    """Run the existing single-market registry/web pipeline."""

    context = request.business_context
    if not context or not _safe_text(context.location, 255):
        return normalize_market_grounding([], policy)

    # Import lazily: worker startup and non-grounded reads should not initialize
    # the generative SDK or regional model.
    from backend.api.research.simulation_bridge.services.pipeline import B2BDataPipeline
    from backend.api.research.simulation_bridge.services.regional_service import RegionalService

    regional = RegionalService()
    pipeline = B2BDataPipeline(
        location=context.location or "",
        business_problem=context.problem,
        target_user=context.target_customer,
        model=regional.model,
        data_source=policy.source_strategy,
        minimum_source_count=policy.minimum_structured_sources,
        minimum_authoritative_source_count=(
            1 if policy.requested_mode == "grounded_deep" else 0
        ),
        required_evidence_classes=list(
            (
                (context.grounding_context or {}).get(
                    "critical_claim_acquisition", {}
                )
                or {}
            ).get("applicable_claim_classes")
            or []
        ),
        topic_seed_contract=(
            ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
            .get("topic_seed_contract")
        ),
        topic_market_scope_contract=(
            ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
            .get("topic_market_scope_contract")
        ),
        topic_alias_expansion=(
            ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
            .get("topic_alias_expansion")
        ),
    )
    companies = await pipeline.run()
    grounding = normalize_market_grounding(companies, policy)
    sources, claims = _merge_market_evidence(
        list(grounding.get("market_sources") or []) + list(pipeline.market_sources),
        list(grounding.get("market_claims") or []) + list(pipeline.market_claims),
        policy,
    )
    grounding["market_sources"] = sources
    grounding["market_claims"] = claims
    grounding["structured_source_count"] = len(grounding["market_sources"])
    grounding["claim_count"] = len(grounding["market_claims"])
    grounding["routing_diagnostics"] = pipeline.routing_diagnostics
    topic_seed_contract = (
        ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
        .get("topic_seed_contract")
    )
    if topic_seed_contract:
        grounding["topic_seed_contract"] = topic_seed_contract
    topic_market_scope_contract = (
        ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
        .get("topic_market_scope_contract")
    )
    if topic_market_scope_contract:
        grounding["topic_market_scope_contract"] = topic_market_scope_contract
    topic_alias_expansion = (
        ((context.grounding_context or {}).get("critical_claim_acquisition", {}) or {})
        .get("topic_alias_expansion")
    )
    if topic_alias_expansion:
        grounding["topic_alias_expansion"] = topic_alias_expansion
    if pipeline.deferred_companies:
        grounding["_deferred_company_enrichment"] = [
            {"pipeline": pipeline, "policy": policy}
        ]
    return grounding


async def complete_deferred_grounding_enrichment(
    grounding: Dict[str, Any],
    policy: HybridGroundingPolicy,
) -> Dict[str, Any]:
    """Run non-critical company enrichment only after critical evidence passes."""

    entries = list(grounding.pop("_deferred_company_enrichment", []) or [])
    for entry in entries:
        pipeline = entry.get("pipeline") if isinstance(entry, dict) else None
        if pipeline is None:
            continue
        companies = await pipeline.complete_deferred_company_enrichment()
        normalized = normalize_market_grounding(companies, policy)
        sources, claims = _merge_market_evidence(
            list(grounding.get("market_sources") or [])
            + list(normalized.get("market_sources") or [])
            + list(pipeline.market_sources),
            list(grounding.get("market_claims") or [])
            + list(normalized.get("market_claims") or [])
            + list(pipeline.market_claims),
            policy,
        )
        grounding["market_sources"] = sources
        grounding["market_claims"] = claims
        grounding["structured_source_count"] = len(sources)
        grounding["claim_count"] = len(claims)
        grounding["company_count"] = max(
            int(grounding.get("company_count") or 0), len(companies)
        )
    return grounding


def _merge_market_evidence(
    source_rows: List[Dict[str, Any]],
    claim_rows: List[Dict[str, Any]],
    policy: HybridGroundingPolicy,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Deduplicate real evidence before evaluating a minimum-source contract."""

    def signed_direct_rank(source: Dict[str, Any]) -> int:
        """Prefer the source identity cryptographically bound to the document.

        Company parsing can emit a lightweight row for a URL before the direct
        authority pipeline emits its signed row for the same document.  Keeping
        the first row used to rewrite the signed claim to the lightweight ID,
        while its span artifact remained bound to the signed ID.  The quality
        validator correctly rejected that broken join.  This is precedence,
        not trust: the proof is still fully validated by the quality gate.
        """

        proof = source.get("authority_proof")
        # Pipeline persistence intentionally strips the full fetched text and
        # publishes only signed document metadata as ``authority_document``.
        # Accept the internal name as a compatibility fallback for callers
        # that merge before bundle sanitization.
        artifact = source.get("authority_document") or source.get(
            "authority_document_artifact"
        )
        if not isinstance(proof, dict) or not isinstance(artifact, dict):
            return 0
        source_id = str(source.get("source_id") or "")
        signature = str(proof.get("proof_signature") or "")
        artifact_signature = str(artifact.get("authority_proof_signature") or "")
        artifact_source_id = str(artifact.get("source_id") or "")
        if (
            source_id
            and artifact.get("artifact_type") == "direct_authority_document"
            and artifact_source_id == source_id
            and len(signature) == 64
            and artifact_signature == signature
            and artifact.get("sha256")
            == str((proof.get("direct") or {}).get("content_sha256") or "")
            and artifact.get("retrieved_at") == proof.get("retrieved_at")
            and validate_authority_proof(
                source,
                requested_country_codes=source.get("country_codes") or [],
            )
        ):
            return 2
        return 0

    def redirect_aliases(old_id: str, new_id: str) -> None:
        for alias, canonical_id in list(source_aliases.items()):
            if canonical_id == old_id:
                source_aliases[alias] = new_id
        source_aliases[old_id] = new_id
        source_aliases[new_id] = new_id

    canonical_sources: Dict[str, Dict[str, Any]] = {}
    source_aliases: Dict[str, str] = {}
    for row in source_rows:
        if not isinstance(row, dict):
            continue
        source_id = _safe_text(row.get("source_id"), 255)
        source_type = _safe_text(row.get("source_type"), 80)
        if not source_id or source_type not in policy.allowed_source_types:
            continue
        url = _real_url(row.get("url"))
        registry = row.get("registry")
        if source_type == "company_registry":
            register_number = (
                _safe_text(registry.get("register_number"), 160)
                if isinstance(registry, dict)
                else None
            )
            if not register_number:
                continue
            evidence_key = f"registry:{register_number.casefold()}"
        elif source_type == "provided_document":
            content_hash = _safe_text(row.get("content_hash"), 128)
            if not content_hash:
                continue
            evidence_key = f"document:{content_hash.casefold()}"
        else:
            if not url:
                continue
            parsed_url = urlparse(url)
            canonical_host = parsed_url.hostname or ""
            try:
                parsed_port = parsed_url.port
            except ValueError:
                continue
            if parsed_port:
                canonical_host = f"{canonical_host}:{parsed_port}"
            canonical_path = parsed_url.path.rstrip("/") or "/"
            # Query strings and fragments often carry search-provider tracking.
            # Ignore them for minimum-source counting so one document cannot be
            # counted repeatedly through different provider wrappers.
            evidence_key = f"url:{canonical_host.casefold()}{canonical_path}"

        existing = canonical_sources.get(evidence_key)
        if existing:
            existing_id = str(existing["source_id"])
            if signed_direct_rank(row) > signed_direct_rank(existing):
                # Make the cryptographically bound source ID canonical and
                # remap every earlier lightweight alias to it.  Preserve useful
                # parser metadata, but the signed row owns all nonempty proof,
                # identity, authority and direct-document fields.
                replacement = dict(existing)
                for key, value in row.items():
                    if value not in (None, "", [], {}):
                        replacement[key] = value
                for list_key in ("research_cell_ids", "country_codes"):
                    replacement[list_key] = list(
                        dict.fromkeys(
                            list(existing.get(list_key) or [])
                            + list(row.get(list_key) or [])
                        )
                    )
                canonical_sources[evidence_key] = replacement
                redirect_aliases(existing_id, source_id)
                continue
            source_aliases[source_id] = existing_id
            for list_key in ("research_cell_ids", "country_codes"):
                existing[list_key] = list(
                    dict.fromkeys(
                        list(existing.get(list_key) or []) + list(row.get(list_key) or [])
                    )
                )
            for key, value in row.items():
                if value not in (None, "", [], {}) and existing.get(key) in (
                    None,
                    "",
                    [],
                    {},
                ):
                    existing[key] = value
            continue
        canonical = dict(row)
        if url:
            canonical["url"] = url
        canonical_sources[evidence_key] = canonical
        source_aliases[source_id] = source_id

    sources = list(canonical_sources.values())[: policy.maximum_sources]
    retained_source_ids = {str(row["source_id"]) for row in sources}
    claims_by_identity: Dict[str, Dict[str, Any]] = {}

    def remap_claim_bindings(claim: Dict[str, Any]) -> None:
        # Signed claim bindings include source_id in their HMAC payload. Never
        # mutate them. A signed claim whose source lost canonical precedence is
        # discarded by the retained-source join below.
        artifact = claim.get("provenance_artifact")
        if isinstance(artifact, dict) and isinstance(
            artifact.get("claim_binding"), dict
        ):
            return
        citation = claim.get("citation_metadata")
        if isinstance(citation, dict):
            citation = dict(citation)
            source_ref = str(citation.get("source_id") or "")
            if source_ref in source_aliases:
                citation["source_id"] = source_aliases[source_ref]
            claim["citation_metadata"] = citation
        artifact = claim.get("provenance_artifact")
        if isinstance(artifact, dict):
            artifact = dict(artifact)
            source_ref = str(artifact.get("source_id") or "")
            if source_ref in source_aliases:
                artifact["source_id"] = source_aliases[source_ref]
            binding = artifact.get("claim_binding")
            if isinstance(binding, dict):
                binding = dict(binding)
                binding_ref = str(binding.get("source_id") or "")
                if binding_ref in source_aliases:
                    binding["source_id"] = source_aliases[binding_ref]
                artifact["claim_binding"] = binding
            claim["provenance_artifact"] = artifact

    def signed_claim_rank(claim: Dict[str, Any]) -> int:
        artifact = claim.get("provenance_artifact")
        citation = claim.get("citation_metadata")
        if not isinstance(artifact, dict) or not isinstance(citation, dict):
            return 0
        binding = artifact.get("claim_binding")
        if not isinstance(binding, dict):
            return 0
        source_ids = {str(value) for value in claim.get("source_ids") or [] if value}
        source_id = str(artifact.get("source_id") or "")
        return int(
            artifact.get("artifact_type") == "direct_authority_document"
            and source_id in source_ids
            and citation.get("source_id") == source_id
            and binding.get("source_id") == source_id
            and len(str(artifact.get("sha256") or "")) == 64
            and len(str(artifact.get("authority_proof_signature") or "")) == 64
            and len(str(binding.get("claim_proof_signature") or "")) == 64
        )

    for row in claim_rows:
        if not isinstance(row, dict):
            continue
        source_ids = list(
            dict.fromkeys(
                source_aliases[source_id]
                for source_id in (
                    _safe_text(value, 255) for value in row.get("source_ids") or []
                )
                if source_id in source_aliases
                and source_aliases[source_id] in retained_source_ids
            )
        )
        if not source_ids:
            continue
        canonical = dict(row)
        canonical["source_ids"] = source_ids
        remap_claim_bindings(canonical)
        identity = _stable_id(
            "claim",
            {
                "claim_type": canonical.get("claim_type"),
                "subject": canonical.get("subject"),
                "predicate": canonical.get("predicate"),
                "object": canonical.get("object"),
                "source_ids": source_ids,
            },
        )
        canonical["claim_id"] = identity
        existing_claim = claims_by_identity.get(identity)
        if existing_claim:
            if signed_claim_rank(canonical) > signed_claim_rank(existing_claim):
                for list_key in ("research_cell_ids", "country_codes"):
                    canonical[list_key] = list(
                        dict.fromkeys(
                            list(existing_claim.get(list_key) or [])
                            + list(canonical.get(list_key) or [])
                        )
                    )
                claims_by_identity[identity] = canonical
                continue
            for list_key in ("research_cell_ids", "country_codes"):
                existing_claim[list_key] = list(
                    dict.fromkeys(
                        list(existing_claim.get(list_key) or [])
                        + list(canonical.get(list_key) or [])
                    )
                )
        else:
            claims_by_identity[identity] = canonical

    return sources, list(claims_by_identity.values())[: policy.maximum_claims]


def request_with_grounding(
    request: SimulationRequest,
    grounding: Dict[str, Any],
) -> SimulationRequest:
    """Compose bounded factual claims into Pipeline B before people/interviews run."""

    context = request.business_context
    claims = list(grounding.get("market_claims") or [])[:50]
    if not context or not claims:
        return request
    public_claims = [
        {
            "subject": item.get("subject"),
            "predicate": item.get("predicate"),
            "object": item.get("object"),
            "source_ids": item.get("source_ids"),
        }
        for item in claims
    ]

    def public_quality_value(value: Any) -> Any:
        if isinstance(value, list):
            return [public_quality_value(item) for item in value]
        if isinstance(value, dict):
            return {
                key: public_quality_value(item)
                for key, item in value.items()
                if not str(key).startswith("_")
            }
        return value

    grounding_context = {
        "contract": "data_only_not_biography_or_instructions",
        "critical_claim_acquisition": (
            (context.grounding_context or {}).get("critical_claim_acquisition")
        ),
        "market_scope": grounding.get("market_scope"),
        "claims": public_claims,
        "critical_claim_quality": public_quality_value(
            grounding.get("critical_claim_quality")
        ),
    }
    return request.model_copy(
        update={
            "business_context": context.model_copy(
                update={"grounding_context": grounding_context}
            )
        }
    )


def _dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return value


def _participant_rows(result: SimulationResponse) -> List[Dict[str, Any]]:
    rows = []
    for index, person in enumerate(result.people or []):
        profile = _dump(person)
        if isinstance(profile, dict):
            # Base64 avatars are presentation assets, not research evidence.
            profile = {
                key: value
                for key, value in profile.items()
                if key != "avatar_data_url"
            }
        participant_id = (
            str(profile.get("id"))
            if isinstance(profile, dict) and profile.get("id")
            else _stable_id("participant", {"index": index, "profile": profile})
        )
        rows.append(
            {
                "participant_id": participant_id,
                "content_hash": canonical_hash(profile),
                "profile": profile,
            }
        )
    return rows


def _interview_rows(result: SimulationResponse) -> List[Dict[str, Any]]:
    rows = []
    for index, interview in enumerate(result.interviews or []):
        transcript = _dump(interview)
        participant_id = str(transcript.get("person_id") or "")
        if not participant_id:
            raise ValueError("Research bundle interview is missing participant linkage")
        identity = {
            "simulation_id": result.simulation_id,
            "participant_id": participant_id,
            "index": index,
        }
        rows.append(
            {
                "interview_id": _stable_id("interview", identity),
                "participant_id": participant_id,
                "content_hash": canonical_hash(transcript),
                "transcript": transcript,
            }
        )
    return rows


def _persona_rows(result: SimulationResponse) -> List[Dict[str, Any]]:
    rows = []
    for index, persona in enumerate(result.empirical_personas or []):
        if not is_customer_persona_eligible(persona):
            continue
        identity = {
            "simulation_id": result.simulation_id,
            "name": persona.get("name") or persona.get("persona_name"),
            "index": index,
        }
        rows.append(
            {
                "persona_id": _stable_id("customer-persona", identity),
                "content_hash": canonical_hash(persona),
                "persona": persona,
            }
        )
    return rows


def _link_selected_customer_persona(
    customer_personas: List[Dict[str, Any]],
    persona_resolution: Dict[str, Any],
) -> List[str]:
    """Link the resolved primary profile to one empirical candidate when possible."""

    selected = persona_resolution.get("customer_persona")
    if not isinstance(selected, dict):
        return []
    selected_name = _safe_text(selected.get("name"), 500)
    for row in customer_personas:
        persona = row.get("persona") or {}
        candidate_name = _safe_text(
            persona.get("name") or persona.get("persona_name"), 500
        )
        if (
            selected_name
            and candidate_name
            and selected_name.casefold() == candidate_name.casefold()
        ):
            row["selection_status"] = "selected_primary"
            row["resolved_customer_persona"] = selected
            return [row["persona_id"]]

    identity = {
        "name": selected_name,
        "profile": selected.get("profile"),
        "evidence": selected.get("evidence"),
    }
    row = {
        "persona_id": _stable_id("customer-persona", identity),
        "content_hash": canonical_hash(selected),
        "persona": selected,
        "selection_status": "selected_primary",
        "resolved_customer_persona": selected,
    }
    customer_personas.append(row)
    return [row["persona_id"]]


def _role_tokens(*values: Any) -> set[str]:
    text = " ".join(str(value or "") for value in values).casefold()
    stop = {
        "and",
        "agent",
        "for",
        "lead",
        "manager",
        "specialist",
        "the",
        "with",
    }
    return {
        token
        for token in re.findall(r"[a-z0-9]+", text)
        if len(token) > 2 and token not in stop
    }


def _role_key(value: Any) -> str:
    text = _safe_text(value, 255)
    if not text:
        return ""
    text = text.casefold().replace("&", " and ")
    return " ".join(re.findall(r"[a-z0-9]+", text))


def _canonical_executor_role(value: Any) -> Optional[str]:
    key = _role_key(value)
    if not key:
        return None
    for role, aliases in _EXECUTOR_ROLE_ALIASES.items():
        if key in {_role_key(role), *(_role_key(alias) for alias in aliases)}:
            return role
    return None


def _is_non_execution_role(value: Any) -> bool:
    return _role_key(value) in _NON_EXECUTION_ROLE_KEYS


def derive_executor_role_specs(
    task_context: Optional[Dict[str, Any]],
    persona_resolution: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """Derive bounded role profiles without promoting arbitrary capabilities."""

    task = task_context if isinstance(task_context, dict) else {}
    ideal = persona_resolution if isinstance(persona_resolution, dict) else {}
    ideal = ideal.get("ideal_agent_persona") or {}
    required_capabilities = [
        value
        for value in (
            _safe_text(item, 255)
            for item in (task.get("required_capabilities") or [])
        )
        if value
    ][:100]
    explicit_roles = [
        value
        for value in (
            _safe_text(item, 255)
            for item in (task.get("required_execution_roles") or [])
        )
        if value and not _is_non_execution_role(value)
    ][:20]

    specs_by_role: Dict[str, Dict[str, Any]] = {}

    def add(
        role: str,
        source: str,
        capability: Optional[str] = None,
        *,
        preserve_public_role: bool = False,
    ) -> None:
        canonical = _canonical_executor_role(role) or role
        key = canonical.casefold()
        if key not in specs_by_role:
            specs_by_role[key] = {
                # Explicit requested roles are durable public identifiers.  A
                # shorter internal playbook key must never rewrite them on the
                # AxWise -> Orqaly wire contract.
                "role": role if preserve_public_role else canonical,
                "playbook_role": canonical,
                "derivation": source,
                "source_capabilities": [],
            }
        if capability:
            values = specs_by_role[key]["source_capabilities"]
            if capability.casefold() not in {item.casefold() for item in values}:
                values.append(capability)

    if explicit_roles:
        for role in explicit_roles:
            add(
                role,
                "research_brief.required_execution_roles",
                preserve_public_role=True,
            )
        for capability in required_capabilities:
            canonical = _canonical_executor_role(capability)
            if canonical and canonical.casefold() in specs_by_role:
                add(canonical, "research_brief.required_execution_roles", capability)
        return list(specs_by_role.values())

    for capability in required_capabilities:
        canonical = _canonical_executor_role(capability)
        if canonical:
            add(canonical, "bounded_required_capability_alias", capability)
    if specs_by_role:
        return list(specs_by_role.values())

    fallback = _safe_text(ideal.get("role"), 255)
    if fallback and _is_non_execution_role(fallback):
        fallback = None
    fallback = _canonical_executor_role(fallback) or fallback
    if not fallback:
        category = _safe_text(task.get("category"), 120) or "execution"
        category = category.replace("_", " ")
        if category.casefold() == "general operations":
            category = "operations"
        fallback = f"Customer-aligned {category} specialist"
    add(fallback, "single_ideal_profile_fallback")
    specs = list(specs_by_role.values())
    specs[0]["source_capabilities"] = required_capabilities
    return specs


def _candidate_canonical_roles(candidate: Dict[str, Any]) -> set[str]:
    values: List[Any] = [candidate.get("name"), candidate.get("role")]
    capabilities = candidate.get("capabilities")
    if isinstance(capabilities, list):
        values.extend(capabilities)
    return {
        role
        for role in (_canonical_executor_role(value) for value in values)
        if role
    }


def _match_executor_agents(
    roles: List[str], agent_candidates: List[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """Greedily match supplied tenant agents; never invent an assignment."""

    assignments: Dict[str, Dict[str, Any]] = {}
    used_agent_ids: set[str] = set()
    for role in roles:
        role_terms = _role_tokens(role)
        canonical_role = _canonical_executor_role(role) or role
        ranked = []
        for candidate in agent_candidates:
            agent_id = _safe_text(candidate.get("agent_id"), 255)
            if not agent_id or agent_id in used_agent_ids:
                continue
            available = str(
                candidate.get("availability_status") or "available"
            ).casefold()
            if available not in {"active", "available", "idle"}:
                continue
            candidate_terms = _role_tokens(
                candidate.get("name"),
                candidate.get("role"),
                candidate.get("description"),
                candidate.get("capabilities"),
            )
            canonical_match = canonical_role in _candidate_canonical_roles(candidate)
            overlap = len(role_terms & candidate_terms)
            if not canonical_match and overlap <= 0:
                continue
            coverage = overlap / max(1, len(role_terms))
            ranked.append((int(canonical_match), coverage, overlap, agent_id, candidate))
        if not ranked:
            continue
        _, _, _, agent_id, candidate = max(ranked, key=lambda item: item[:4])
        assignments[role] = candidate
        used_agent_ids.add(agent_id)
    return assignments


def _bounded_research_value(
    value: Any,
    *,
    depth: int = 0,
    maximum_depth: int = 3,
) -> Any:
    """Bound research-derived context before embedding it in executor profiles."""

    if depth > maximum_depth:
        return None
    if isinstance(value, str):
        return _safe_text(value, 1000)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, list):
        return [
            bounded
            for item in value[:12]
            if (bounded := _bounded_research_value(
                item, depth=depth + 1, maximum_depth=maximum_depth
            ))
            is not None
        ]
    if isinstance(value, dict):
        result: Dict[str, Any] = {}
        for key, item in list(value.items())[:30]:
            if str(key).startswith("_"):
                continue
            bounded = _bounded_research_value(
                item, depth=depth + 1, maximum_depth=maximum_depth
            )
            if bounded is not None:
                result[str(key)[:120]] = bounded
        return result
    return None


def _find_profile_value(
    value: Any,
    names: set[str],
    *,
    depth: int = 0,
) -> Any:
    if depth > 3:
        return None
    if isinstance(value, dict):
        for key, item in value.items():
            if _role_key(key).replace(" ", "_") in names and item not in (None, "", []):
                return _bounded_research_value(item)
        for item in value.values():
            found = _find_profile_value(item, names, depth=depth + 1)
            if found not in (None, "", []):
                return found
    elif isinstance(value, list):
        for item in value[:12]:
            found = _find_profile_value(item, names, depth=depth + 1)
            if found not in (None, "", []):
                return found
    return None


def _selected_customer_snapshot(
    customer_personas: List[Dict[str, Any]],
    selected_ids: List[str],
    fallback_evidence_refs: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    selected = next(
        (
            row
            for row in customer_personas
            if str(row.get("persona_id")) in {str(value) for value in selected_ids}
        ),
        None,
    )
    if not selected:
        return None
    profile = (
        selected.get("resolved_customer_persona")
        or selected.get("persona")
        or {}
    )
    evidence_refs = [
        str(value)
        for value in (
            selected.get("source_ids")
            or (profile.get("source_ids") if isinstance(profile, dict) else [])
            or []
        )
        if value
    ]
    evidence_refs.extend(
        str(value) for value in (fallback_evidence_refs or []) if value
    )
    if isinstance(profile, dict):
        for item in profile.get("evidence") or []:
            if isinstance(item, dict):
                ref = (
                    item.get("reference_id")
                    or item.get("source_id")
                    or item.get("document_id")
                )
                if ref:
                    evidence_refs.append(str(ref))
    return {
        "persona_id": selected.get("persona_id"),
        "name": _safe_text(
            profile.get("name") or profile.get("persona_name"), 500
        ),
        "stakeholder_type": _find_profile_value(
            profile, {"stakeholder_type", "role", "occupation", "job_title"}
        ),
        "decision_role": _safe_text(profile.get("decision_role"), 120),
        "buyer_role": profile.get("buyer_role") is True,
        "selection_eligibility": _safe_text(
            profile.get("selection_eligibility"), 120
        ),
        "pain_signals": _find_profile_value(
            profile,
            {"pain_points", "pains", "challenges", "frustrations", "problems"},
        ),
        "goal_signals": _find_profile_value(
            profile,
            {
                "goals",
                "goals_and_motivations",
                "motivations",
                "desired_outcomes",
                "needs",
            },
        ),
        "buying_context": _find_profile_value(
            profile,
            {
                "buying_behavior",
                "buying_process",
                "decision_making",
                "decision_criteria",
                "triggers",
            },
        ),
        "communication_preferences": _find_profile_value(
            profile,
            {
                "communication_style",
                "preferred_communication_style",
                "communication_preferences",
            },
        ),
        "confidence": _find_profile_value(
            profile, {"confidence", "confidence_score", "overall_confidence"}
        ),
        "content_hash": selected.get("content_hash"),
        "evidence_refs": list(dict.fromkeys(evidence_refs))[:100],
    }


def _role_playbook(role: str) -> Dict[str, Any]:
    configured = _EXECUTOR_ROLE_PLAYBOOKS.get(role)
    if configured:
        return configured
    return {
        "mission_focus": f"Own the bounded {role} workstream for the approved task.",
        "expertise": [role, "evidence synthesis", "requirements traceability"],
        "methods": [
            "Trace each material conclusion to research evidence or a labeled assumption.",
            "Use explicit acceptance criteria and surface missing expertise for human review.",
            "Keep work within the assigned role and Orqaly authorization boundary.",
        ],
        "decision_lens": [
            "Is the decision supported, reversible where possible, and within role scope?",
            "Are uncertainty, dependencies, and handoffs explicit?",
        ],
        "outputs": [
            "Role-scoped deliverable with cited inputs and explicit assumptions.",
            "Open risks, decisions, and required handoffs.",
        ],
        "risks": [
            "Acting outside declared expertise.",
            "Treating synthetic or source-associated evidence as independently verified fact.",
        ],
    }


def _executor_rows(
    persona_resolution: Dict[str, Any],
    task_context: Optional[Dict[str, Any]],
    agent_candidates: List[Dict[str, Any]],
    customer_persona_ids: List[str],
    research_context: Optional[Dict[str, Any]] = None,
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Create one explicitly synthetic professional profile per required role."""

    task = task_context or {}
    context = research_context or {}
    role_specs = derive_executor_role_specs(task, persona_resolution)
    roles = [item["role"] for item in role_specs]
    specs_by_role = {item["role"]: item for item in role_specs}

    matched = _match_executor_agents(roles, agent_candidates)
    ideal = persona_resolution.get("ideal_agent_persona") or {}
    communication_style = _safe_text(
        ideal.get("communication_style"), 500
    ) or "clear, evidence-grounded, and explicit about uncertainty"
    operating_principles = [
        value
        for value in (
            _safe_text(item, 500)
            for item in (ideal.get("operating_principles") or [])
        )
        if value
    ]
    if not operating_principles:
        operating_principles = [
            "Use cited customer and market evidence for material conclusions.",
            "State uncertainty and never invent customer or company facts.",
            "Require Orqaly authorization before tools or consequential actions.",
        ]

    rows: List[Dict[str, Any]] = []
    persona_assignments: List[Dict[str, Any]] = []
    for role in roles:
        role_spec = specs_by_role[role]
        playbook_role = role_spec.get("playbook_role") or role
        playbook = _role_playbook(playbook_role)
        candidate = matched.get(role)
        supplied_capabilities = [
            value
            for value in (
                _safe_text(item, 255)
                for item in ((candidate or {}).get("capabilities") or [])
            )
            if value
        ]
        capabilities = list(
            dict.fromkeys(
                [
                    role,
                    *role_spec["source_capabilities"],
                    *supplied_capabilities,
                ]
            )
        )[:20]
        mission = (
            _safe_text(task.get("desired_outcome"), 1000)
            or _safe_text(task.get("description"), 1000)
            or _safe_text(task.get("title"), 1000)
            or f"Execute the {role} scope"
        )
        profile = {
            "profile_type": "synthetic_professional_profile",
            "profile_version": "axwise_executor_persona_v1",
            "identity_disclosure": (
                "Synthetic non-human professional profile; it does not represent "
                "a real person's employment, credentials, or legal authority."
            ),
            "role": role,
            "playbook_role": playbook_role,
            "mission": mission,
            "mission_focus": playbook["mission_focus"],
            "professional_summary": (
                f"A synthetic {role} execution profile configured for the approved "
                f"{_safe_text(task.get('category'), 255) or 'commercial'} task and its "
                "selected customer research."
            ),
            "relevant_experience": (
                "Synthetic competency coverage in "
                + ", ".join(playbook["expertise"])
                + "; this is not a claim about a real person's career or credentials."
            ),
            "experience_model": {
                "experience_kind": "synthetic_competency_model",
                "domains": playbook["expertise"],
                "no_real_world_credential_claim": True,
            },
            "expertise": playbook["expertise"],
            "domain_knowledge": [
                value
                for value in [
                    _safe_text(task.get("category"), 255),
                    role,
                ]
                if value
            ],
            "capabilities": capabilities,
            "methods": playbook["methods"],
            "work_style": {
                "planning": "requirements-first, evidence-traceable, and assumption-aware",
                "collaboration": (
                    "Coordinate through explicit inputs, outputs, owners, and handoffs; "
                    "do not absorb another specialist's decision authority."
                ),
                "validation": (
                    "Test deliverables against acceptance criteria, contradictions, "
                    "source coverage, and customer relevance before completion."
                ),
            },
            "communication_style": communication_style,
            "decision_lens": playbook["decision_lens"],
            "output_contract": {
                "expected_outputs": playbook["outputs"],
                "quality_rules": [
                    "Cite stable research source, claim, persona, or PRD identifiers.",
                    "Label synthetic evidence and unverified assumptions explicitly.",
                    "Do not silently omit acceptance criteria or truncate the deliverable.",
                    "Escalate contradictions that materially change the recommendation.",
                ],
            },
            "risks": playbook["risks"],
            "boundaries": [
                *operating_principles,
                "This profile cannot claim a real professional licence or human identity.",
                "No consequential action or external tool use without Orqaly authorization.",
                "Source-associated market claims are not independently verified facts.",
            ],
            "customer_adaptation": {
                "selected_customer": context.get("selected_customer"),
                "adaptation_rule": (
                    "Use only the selected persona's research-derived pains, goals, "
                    "buying context, and communication preferences; do not generalize "
                    "synthetic evidence into market prevalence."
                ),
                "locale": context.get("location"),
            },
            "research_context": {
                "bundle_version": context.get("bundle_version") or BUNDLE_VERSION,
                "run_id": context.get("run_id"),
                "analysis_result_id": context.get("analysis_result_id"),
                "research_prd": context.get("research_prd"),
                "location": context.get("location"),
                "market_scope": context.get("market_scope"),
                "research_cells": context.get("research_cells"),
                "cell_coverage": context.get("cell_coverage"),
                "industry": context.get("industry"),
                "problem": context.get("problem"),
                "source_ids": context.get("source_ids", []),
                "claim_refs": context.get("claim_refs", []),
                "pattern_refs": context.get("pattern_refs", []),
                "contradiction_refs": context.get("contradiction_refs", []),
                "grounding_mode": context.get("grounding_mode"),
            },
            "scope": {
                "problem": _safe_text(task.get("description"), 1000),
                "desired_outcome": _safe_text(task.get("desired_outcome"), 1000),
                "success_criteria": playbook["outputs"],
            },
            "task_fit": {
                "task_id": _safe_text(task.get("task_id"), 255),
                "title": _safe_text(task.get("title"), 1000),
                "required_role": role,
                "role_derivation": role_spec["derivation"],
                "task_required_capabilities": [
                    value
                    for value in (
                        _safe_text(item, 255)
                        for item in (task.get("required_capabilities") or [])
                    )
                    if value
                ][:100],
                "matched_supplied_agent": bool(candidate),
            },
            "customer_persona_ids": customer_persona_ids,
            "provenance": {
                "profile_generation": "deterministic_from_task_contract_v1",
                "identity_kind": "synthetic_non_human_execution_profile",
                "agent_facts_source": "orqaly_supplied_candidate" if candidate else None,
                "role_playbook": (
                    "bounded_commercial_role_v1"
                    if playbook_role in _EXECUTOR_ROLE_PLAYBOOKS
                    else "bounded_generic_role_v1"
                ),
            },
        }
        identity = {
            "task_id": task.get("task_id"),
            "role": role,
            "candidate_agent_id": (candidate or {}).get("agent_id"),
        }
        persona_id = _stable_id("executor-persona", identity)
        rows.append(
            {
                "persona_id": persona_id,
                "persona_kind": "required_role",
                "required_role": role,
                "role_derivation": role_spec["derivation"],
                "content_hash": canonical_hash(profile),
                "persona": profile,
                "evidence_refs": list(
                    dict.fromkeys(
                        [
                            *[str(value) for value in context.get("source_ids", []) if value],
                            *[
                                str(item.get("claim_id"))
                                for item in context.get("claim_refs", [])
                                if isinstance(item, dict) and item.get("claim_id")
                            ],
                            *[str(value) for value in customer_persona_ids if value],
                        ]
                    )
                )[:100],
            }
        )
        persona_assignments.append(
            {
                "assignment_id": _stable_id("persona-assignment", identity),
                "persona_id": persona_id,
                "required_role": role,
                "assignment_role": role,
                "role_derivation": role_spec["derivation"],
                "agent_id": _safe_text((candidate or {}).get("agent_id"), 255),
                "agent_name": _safe_text((candidate or {}).get("name"), 255),
                "assignment_status": (
                    "matched_candidate" if candidate else "role_match_pending"
                ),
                "requires_orqaly_authorization": True,
                "task_id": _safe_text(task.get("task_id"), 255),
                "customer_persona_ids": customer_persona_ids,
                "research_run_id": context.get("run_id"),
            }
        )
    return rows, persona_assignments


def _contradictions(result: SimulationResponse) -> List[Any]:
    data = result.data if isinstance(result.data, dict) else {}
    values = data.get("contradictions") or []
    return values[:100] if isinstance(values, list) else []


def _owned_business_evidence_facts(
    grounding: Mapping[str, Any],
    profile: BusinessEvidenceProfileV1,
) -> List[Dict[str, Any]]:
    """Project typed facts only through an explicitly enabled adapter."""

    enabled_projection_models = configured_business_evidence_projection_models()
    if profile.economic_model == "none":
        return []
    require_enabled_business_evidence_projection(profile)
    return project_business_evidence_facts(
        grounding,
        profile,
        enabled_models=enabled_projection_models,
    )


def build_business_evidence_contract_for_grounding(
    grounding: Mapping[str, Any],
    profile: BusinessEvidenceProfileV1,
) -> Dict[str, Any]:
    """Project and seal the live contract at the post-quality boundary."""

    return build_business_evidence_contract_v1(
        profile,
        _owned_business_evidence_facts(grounding, profile),
    )


def _complete_business_evidence_owner_ledger(
    grounding: Mapping[str, Any],
    emitted_facts: List[Mapping[str, Any]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Serialize every and only v2 fact owner without generic list slicing."""

    critical = grounding.get("critical_claim_quality")
    if not isinstance(critical, Mapping):
        critical = {}
    raw_ledger = critical.get("evidence_ledger") or []
    if not isinstance(raw_ledger, list):
        raise ValueError("business evidence owner ledger must be a list")
    emitted_by_id: Dict[str, Mapping[str, Any]] = {}
    for fact in emitted_facts:
        fact_id = str(fact.get("fact_id") or "")
        if not fact_id or fact_id in emitted_by_id:
            raise ValueError("emitted business evidence fact IDs must be unique")
        emitted_by_id[fact_id] = fact
    if not emitted_by_id:
        return [], []

    safe_fact_keys = (
        "fact_id",
        "claim_id",
        "fact_terms",
        "metric_key",
        "unit",
        "normalized_value",
        "display_value",
        "country_codes",
        "identity_version",
        "evidence_class",
        "temporal_scope",
        "source_scope",
        "semantic_scope",
        "identity_complete",
        "signed_offer_product_name",
        "signed_offer_sha256",
        "topic_seed_sha256",
    )
    owners: Dict[str, tuple[int, int]] = {}
    serialized_rows: List[Dict[str, Any]] = []
    serialized_facts: List[Dict[str, Any]] = []
    for row_index, row in enumerate(raw_ledger):
        if not isinstance(row, Mapping):
            continue
        row_facts = row.get("facts") or []
        if not isinstance(row_facts, list):
            raise ValueError("business evidence owner facts must be a list")
        selected: List[Dict[str, Any]] = []
        for fact_index, material_fact in enumerate(row_facts):
            if not isinstance(material_fact, Mapping):
                continue
            fact_id = str(material_fact.get("fact_id") or "")
            emitted = emitted_by_id.get(fact_id)
            if emitted is None:
                continue
            if fact_id in owners:
                raise ValueError("emitted business evidence fact has multiple owners")
            if (
                row.get("status") != "verified_current_authoritative"
                or material_fact.get("claim_id") != emitted.get("claim_id")
                or row.get("claim_id") != emitted.get("claim_id")
                or row.get("source_ids") != emitted.get("source_ids")
                or row.get("country_codes") != emitted.get("country_codes")
                or material_fact.get("source_scope") != emitted.get("source_ids")
                or material_fact.get("country_codes") != emitted.get("country_codes")
                or material_fact.get("topic_seed_sha256")
                != emitted.get("topic_seed_sha256")
            ):
                raise ValueError("serialized business evidence ownership is inconsistent")
            row_instant = datetime.fromisoformat(
                str(row.get("effective_or_observation_at") or "").replace(
                    "Z", "+00:00"
                )
            )
            emitted_instant = datetime.fromisoformat(
                str(emitted.get("observed_at") or "").replace("Z", "+00:00")
            )
            fact_instant = datetime.fromisoformat(
                str(material_fact.get("temporal_scope") or "").replace(
                    "Z", "+00:00"
                )
            )
            if (
                row_instant.tzinfo is None
                or emitted_instant.tzinfo is None
                or fact_instant.tzinfo is None
                or row_instant.astimezone(timezone.utc)
                != emitted_instant.astimezone(timezone.utc)
                or fact_instant.astimezone(timezone.utc)
                != emitted_instant.astimezone(timezone.utc)
            ):
                raise ValueError("serialized business evidence time is inconsistent")
            safe_fact = {
                key: material_fact[key]
                for key in safe_fact_keys
                if key in material_fact
            }
            selected.append(safe_fact)
            serialized_facts.append(safe_fact)
            owners[fact_id] = (row_index, fact_index)
        if selected:
            serialized_rows.append(
                {
                    "claim_id": row.get("claim_id"),
                    "evidence_class": row.get("evidence_class"),
                    "status": row.get("status"),
                    "country_codes": row.get("country_codes"),
                    "source_ids": row.get("source_ids"),
                    "effective_or_observation_at": row.get(
                        "effective_or_observation_at"
                    ),
                    "facts": selected,
                    "sources": [
                        {
                            key: source.get(key)
                            for key in (
                                "source_id",
                                "url",
                                "publisher",
                                "retrieved_at",
                                "source_authority",
                                "authority_proof_signature",
                            )
                            if key in source
                        }
                        for source in (row.get("sources") or [])
                        if isinstance(source, Mapping)
                    ],
                }
            )
    if set(owners) != set(emitted_by_id):
        raise ValueError(
            "every emitted business evidence fact must have one serialized owner"
        )
    serialized_ids = [str(fact.get("fact_id") or "") for fact in serialized_facts]
    if len(serialized_ids) != len(set(serialized_ids)) or set(serialized_ids) != set(
        emitted_by_id
    ):
        raise ValueError("serialized business evidence owner IDs are not exact")
    return serialized_rows, serialized_facts


def _merge_complete_business_evidence_owners(
    serialized_critical: Dict[str, Any],
    *,
    emitted_facts: List[Mapping[str, Any]],
    owner_ledger: List[Dict[str, Any]],
    owner_facts: List[Dict[str, Any]],
) -> None:
    """Add complete typed owners without discarding bounded legacy provenance."""

    emitted_ids = {str(fact.get("fact_id") or "") for fact in emitted_facts}
    if "" in emitted_ids or len(emitted_ids) != len(emitted_facts):
        raise ValueError("emitted business evidence fact IDs must be unique")

    preserved_ledger: List[Dict[str, Any]] = []
    existing_ledger = serialized_critical.get("evidence_ledger") or []
    if not isinstance(existing_ledger, list):
        raise ValueError("serialized critical evidence ledger must be a list")
    for row in existing_ledger:
        if not isinstance(row, Mapping):
            continue
        preserved = dict(row)
        row_facts = row.get("facts")
        if isinstance(row_facts, list):
            remaining_facts = [
                fact
                for fact in row_facts
                if not isinstance(fact, Mapping)
                or str(fact.get("fact_id") or "") not in emitted_ids
            ]
            contained_typed_fact = len(remaining_facts) != len(row_facts)
            if contained_typed_fact and not remaining_facts:
                continue
            preserved["facts"] = remaining_facts
        preserved_ledger.append(preserved)

    preserved_facts: List[Any] = []
    existing_facts = serialized_critical.get("verified_facts") or []
    if not isinstance(existing_facts, list):
        raise ValueError("serialized critical verified facts must be a list")
    for fact in existing_facts:
        if (
            isinstance(fact, Mapping)
            and str(fact.get("fact_id") or "") in emitted_ids
        ):
            continue
        preserved_facts.append(fact)

    merged_ledger = [*preserved_ledger, *owner_ledger]
    merged_facts = [*preserved_facts, *owner_facts]
    typed_owner_ids = [
        str(fact.get("fact_id") or "")
        for row in merged_ledger
        if isinstance(row, Mapping)
        for fact in (row.get("facts") or [])
        if isinstance(fact, Mapping)
        and str(fact.get("fact_id") or "") in emitted_ids
    ]
    typed_verified_ids = [
        str(fact.get("fact_id") or "")
        for fact in merged_facts
        if isinstance(fact, Mapping)
        and str(fact.get("fact_id") or "") in emitted_ids
    ]
    if (
        len(typed_owner_ids) != len(emitted_ids)
        or set(typed_owner_ids) != emitted_ids
        or len(typed_verified_ids) != len(emitted_ids)
        or set(typed_verified_ids) != emitted_ids
    ):
        raise ValueError(
            "business evidence facts do not exactly match serialized owners"
        )
    serialized_critical["evidence_ledger"] = merged_ledger
    serialized_critical["verified_facts"] = merged_facts


def _apply_business_evidence_role_slots(
    profile: BusinessEvidenceProfileV1,
    requested_roles: List[str],
    executor_personas: List[Dict[str, Any]],
    persona_assignments: List[Dict[str, Any]],
) -> None:
    slots = list(profile.required_role_slots)
    if not (
        len(slots)
        == len(requested_roles)
        == len(executor_personas)
        == len(persona_assignments)
    ):
        raise ValueError(
            "business evidence role slots must exactly match requested execution roles"
        )
    for slot, role, persona_row, assignment in zip(
        slots,
        requested_roles,
        executor_personas,
        persona_assignments,
    ):
        if (
            persona_row.get("required_role") != role
            or assignment.get("required_role") != role
            or assignment.get("persona_id") != persona_row.get("persona_id")
        ):
            raise ValueError(
                "business evidence role slot ordering does not match executor roles"
            )
        persona_row["role_slot"] = slot
        persona = persona_row.get("persona")
        if not isinstance(persona, dict):
            raise ValueError("executor persona payload is invalid")
        persona["role_slot"] = slot
        persona_row["content_hash"] = canonical_hash(persona)
        assignment["role_slot"] = slot


def build_research_bundle(
    *,
    job_id: str,
    request: SimulationRequest,
    requested_outputs: Dict[str, Any],
    result: SimulationResponse,
    grounding: Dict[str, Any],
    research_mode: HybridResearchMode,
    grounding_policy: HybridGroundingPolicy,
    analysis_result_id: int,
    research_prd: Dict[str, Any],
    task_context: Optional[Dict[str, Any]] = None,
    agent_candidates: Optional[List[Dict[str, Any]]] = None,
    performance: Optional[Dict[str, Any]] = None,
    prebuilt_business_evidence_contract: Optional[Mapping[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the durable, portable Orqaly handoff with stable IDs and hashes."""

    raw_evidence_profile = (
        task_context.get("business_evidence_profile")
        if isinstance(task_context, dict)
        else None
    )
    evidence_profile = (
        BusinessEvidenceProfileV1.model_validate(raw_evidence_profile)
        if raw_evidence_profile is not None
        else None
    )
    if evidence_profile is not None:
        task_context = {
            **(task_context or {}),
            "business_evidence_profile": evidence_profile.model_dump(mode="json"),
        }

    participants = _participant_rows(result)
    interviews = _interview_rows(result)
    customer_personas = _persona_rows(result)
    persona_resolution = (
        (result.data or {}).get("persona_resolution")
        if isinstance(result.data, dict)
        else None
    ) or {}
    if not customer_personas:
        raise ValueError("Research bundle requires empirical customer personas")
    participant_ids = {item["participant_id"] for item in participants}
    if not participants or not interviews:
        raise ValueError("Research bundle requires participants and interviews")
    if any(item["participant_id"] not in participant_ids for item in interviews):
        raise ValueError("Research bundle interview references an unknown participant")
    selected_persona_ids = _link_selected_customer_persona(
        customer_personas, persona_resolution
    )
    patterns = [_dump(item) for item in (result.persona_patterns or [])]
    contradictions = _contradictions(result)
    market_sources = list(grounding.get("market_sources") or [])
    market_claims = list(grounding.get("market_claims") or [])
    context_source_ids = [
        str(item["source_id"])
        for item in market_sources
        if isinstance(item, dict) and item.get("source_id")
    ]
    research_context = {
        "run_id": job_id,
        "analysis_result_id": analysis_result_id,
        "grounding_mode": research_mode.value,
        "location": _safe_text(
            request.business_context.location if request.business_context else None,
            255,
        ),
        "market_scope": _bounded_research_value(grounding.get("market_scope")),
        "research_cells": _bounded_research_value(grounding.get("research_cells")),
        "cell_coverage": _bounded_research_value(grounding.get("cell_coverage")),
        "industry": _safe_text(
            request.business_context.industry if request.business_context else None,
            255,
        ),
        "problem": _safe_text(
            request.business_context.problem if request.business_context else None,
            2000,
        ),
        "selected_customer": _selected_customer_snapshot(
            customer_personas,
            selected_persona_ids,
            [
                *context_source_ids,
                *[
                    str(item.get("claim_id"))
                    for item in market_claims
                    if isinstance(item, dict) and item.get("claim_id")
                ],
            ],
        ),
        "source_ids": context_source_ids,
        "claim_refs": [
            {
                "claim_id": item.get("claim_id"),
                "subject": _safe_text(item.get("subject"), 500),
                "predicate": _safe_text(item.get("predicate"), 255),
                "object": _safe_text(item.get("object"), 1000),
                "source_ids": [str(value) for value in item.get("source_ids") or []][
                    :20
                ],
                "verification_status": _safe_text(
                    item.get("verification_status"), 120
                ),
            }
            for item in market_claims[:20]
            if isinstance(item, dict)
        ],
        "pattern_refs": [
            {
                "pattern_id": _stable_id("pattern", item),
                "pattern": _bounded_research_value(item, maximum_depth=2),
            }
            for item in patterns[:12]
        ],
        "contradiction_refs": [
            {
                "contradiction_id": _stable_id("contradiction", item),
                "contradiction": _bounded_research_value(item, maximum_depth=2),
            }
            for item in contradictions[:12]
        ],
        "research_prd": {
            "analysis_result_id": research_prd.get("analysis_result_id"),
            "cached_prd_id": research_prd.get("cached_prd_id"),
            "content_hash": research_prd.get("content_hash"),
            "prd_type": research_prd.get("prd_type"),
            "status": research_prd.get("status"),
        },
    }
    if evidence_profile is not None:
        research_context["bundle_version"] = BUSINESS_EVIDENCE_BUNDLE_VERSION
    executor_personas, persona_assignments = _executor_rows(
        persona_resolution,
        task_context,
        agent_candidates or [],
        selected_persona_ids,
        research_context,
    )
    requested_execution_roles = [
        str(value)
        for value in ((task_context or {}).get("required_execution_roles") or [])
        if value and not _is_non_execution_role(value)
    ]
    if evidence_profile is not None:
        if not requested_execution_roles and not evidence_profile.required_role_slots:
            # An explicit no-economics profile may intentionally request no
            # executor. Do not retain the legacy synthesized fallback role.
            executor_personas = []
            persona_assignments = []
        _apply_business_evidence_role_slots(
            evidence_profile,
            requested_execution_roles,
            executor_personas,
            persona_assignments,
        )
    returned_execution_roles = [
        str(item.get("required_role"))
        for item in executor_personas
        if item.get("required_role")
    ]
    requested_role_set = set(requested_execution_roles)
    returned_role_set = set(returned_execution_roles)
    executor_role_coverage = {
        "status": (
            "complete"
            if requested_role_set == returned_role_set
            and len(requested_execution_roles) == len(returned_execution_roles)
            else "blocked"
        ),
        "requested_count": len(requested_execution_roles),
        "returned_count": len(returned_execution_roles),
        "missing_roles": sorted(requested_role_set - returned_role_set),
        "unexpected_roles": sorted(returned_role_set - requested_role_set),
        "role_matches": [
            {"requested_role": role, "returned_role": role, "covered": role in returned_role_set}
            for role in requested_execution_roles
        ],
    }
    persona_resolution = {
        **persona_resolution,
        "customer_persona": {
            **(persona_resolution.get("customer_persona") or {}),
            "evidence_refs": list(
                (research_context.get("selected_customer") or {}).get(
                    "evidence_refs"
                )
                or []
            ),
        },
        "customer_persona_id": (
            selected_persona_ids[0] if selected_persona_ids else None
        ),
        "executor_persona_ids": [
            item["persona_id"] for item in executor_personas
        ],
        "persona_assignment_ids": [
            item["assignment_id"] for item in persona_assignments
        ],
        "required_execution_roles": [
            item["required_role"] for item in executor_personas
        ],
    }
    no_executor_requested = bool(
        evidence_profile is not None
        and not evidence_profile.required_role_slots
        and not requested_execution_roles
    )
    if task_context and not executor_personas and not no_executor_requested:
        raise ValueError("Research bundle requires role-specific executor personas")
    if task_context and not selected_persona_ids:
        raise ValueError("Research bundle requires a resolved primary customer persona")
    for row in participants + interviews + customer_personas + executor_personas:
        row["source_ids"] = context_source_ids
        row["grounding_mode"] = research_mode.value
        row["source_relationship"] = "market_context_not_direct_testimony"
        existing_refs = [str(value) for value in row.get("evidence_refs") or [] if value]
        row["evidence_refs"] = list(
            dict.fromkeys([*existing_refs, *context_source_ids])
        )[:100]
    for assignment in persona_assignments:
        assignment["customer_persona_ids"] = selected_persona_ids
        assignment["source_ids"] = context_source_ids

    artifacts = [
        {
            "artifact_id": f"analysis-result-{analysis_result_id}",
            "artifact_type": "analysis_result",
            "record_id": str(analysis_result_id),
            "content_hash": canonical_hash(
                {
                    "simulation_id": result.simulation_id,
                    "customer_personas": customer_personas,
                    "persona_resolution": persona_resolution,
                }
            ),
        }
    ]
    artifacts.extend(
        {
            "artifact_id": item["participant_id"],
            "artifact_type": "synthetic_participant",
            "record_id": item["participant_id"],
            "content_hash": item["content_hash"],
        }
        for item in participants
    )
    artifacts.extend(
        {
            "artifact_id": item["interview_id"],
            "artifact_type": "synthetic_interview",
            "record_id": item["interview_id"],
            "content_hash": item["content_hash"],
        }
        for item in interviews
    )
    artifacts.extend(
        {
            "artifact_id": item["persona_id"],
            "artifact_type": "empirical_customer_persona",
            "record_id": item["persona_id"],
            "content_hash": item["content_hash"],
        }
        for item in customer_personas
    )
    artifacts.extend(
        {
            "artifact_id": item["persona_id"],
            "artifact_type": "synthetic_executor_persona",
            "record_id": item["persona_id"],
            "content_hash": item["content_hash"],
        }
        for item in executor_personas
    )
    if research_prd.get("content_hash"):
        artifacts.append(
            {
                "artifact_id": (
                    f"cached-prd-{research_prd['cached_prd_id']}"
                    if research_prd.get("cached_prd_id") is not None
                    else _stable_id("research-prd", research_prd)
                ),
                "artifact_type": "research_prd",
                "record_id": (
                    str(research_prd.get("cached_prd_id"))
                    if research_prd.get("cached_prd_id") is not None
                    else None
                ),
                "content_hash": research_prd["content_hash"],
            }
        )

    metadata = result.metadata or {}
    bundle: Dict[str, Any] = {
        "version": BUNDLE_VERSION,
        "bundle_id": f"research-bundle-{job_id}",
        "run_id": job_id,
        "status": "completed",
        "research_prd_hash": research_prd.get("content_hash"),
        "selected_persona_ids": selected_persona_ids,
        "market_scope": grounding.get("market_scope"),
        "research_cells": list(grounding.get("research_cells") or []),
        "cell_coverage": list(grounding.get("cell_coverage") or []),
        "configuration": {
            "pipeline": "hybrid_a_plus_b",
            "research_mode": research_mode.value,
            "grounding_policy": grounding_policy.model_dump(mode="json"),
            "business_context": (
                request.business_context.model_dump(mode="json")
                if request.business_context
                else None
            ),
            "simulation": request.config.model_dump(mode="json"),
            "task_context": task_context,
            "requested_outputs": requested_outputs,
            "provenance": {
                "producer": "axwise",
                "partner": "orqaly",
                "grounding_composer_version": grounding.get("composer_version")
                or GROUNDING_COMPOSER_VERSION,
                "empirical_pipeline": "closed_loop_a_plus_b",
                "evidence_audit": "exact_offsets_v1",
                "result_metadata": metadata,
            },
        },
        "market_sources": market_sources,
        "market_claims": market_claims,
        "synthetic_participants": participants,
        "interviews": interviews,
        "customer_personas": customer_personas,
        "executor_personas": executor_personas,
        "persona_assignments": persona_assignments,
        "patterns": patterns,
        "contradictions": contradictions,
        "method": {
            "version": "axwise_grounded_multi_market_method_v2",
            "sequence": [
                "country_cell_grounding_with_adaptive_source_diversity",
                "cross_market_evidence_synthesis",
                "synthetic_participant_generation",
                "synthetic_interviews",
                "empirical_persona_synthesis",
                "role_specific_executor_profile_synthesis",
                "research_prd_generation",
            ],
            "evidence_labels": {
                "market_claims": (
                    "mixed_per_claim_verification; inspect quality.critical_claims "
                    "and each claim verification_status"
                ),
                "interviews": "synthetic",
                "customer_personas": "derived_from_synthetic_interviews",
                "executor_personas": "synthetic_professional_profiles",
            },
        },
        "limitations": [
            "Synthetic participants and interviews are not real human respondents.",
            "Only claims listed as verified in quality.critical_claims passed the configured authority, freshness, jurisdiction, and exact-provenance checks; all other market claims remain source-associated observations.",
            "Executor personas are synthetic competency profiles, not claims about real credentials.",
            "Prices, prevalence, and conversion assumptions require field validation before consequential use.",
            "Orqaly remains the authority for persona selection, agent assignment, approval, and execution.",
        ],
        "research_prd": research_prd,
        "research_context": research_context,
        "persona_resolution": persona_resolution,
        "artifacts": artifacts,
        "quality": {
            # Canonical Orqaly import contract. Keep the complete ledger and
            # proof signatures; aggregate counts alone cannot support Gate 1.
            "critical_claims": _bounded_research_value(
                grounding.get("critical_claim_quality") or {},
                maximum_depth=8,
            ),
            "requested_execution_roles": requested_execution_roles,
            "returned_execution_roles": returned_execution_roles,
            "executor_role_coverage": executor_role_coverage,
            "source_count": len(market_sources),
            "structured_source_count": int(
                grounding.get("structured_source_count") or len(market_sources)
            ),
            "claim_count": len(market_claims),
            "market_cell_count": len(grounding.get("cell_coverage") or []),
            "completed_market_cell_count": sum(
                row.get("status") == "complete"
                for row in grounding.get("cell_coverage") or []
                if isinstance(row, dict)
            ),
            "participant_count": len(participants),
            "interview_count": len(interviews),
            "customer_persona_count": len(customer_personas),
            "executor_persona_count": len(executor_personas),
            "persona_assignment_count": len(persona_assignments),
            "matched_persona_assignment_count": sum(
                item.get("assignment_status") == "matched_candidate"
                for item in persona_assignments
            ),
            "pending_persona_assignment_count": sum(
                item.get("assignment_status") == "role_match_pending"
                for item in persona_assignments
            ),
            "pattern_count": len(patterns),
            "contradiction_count": len(contradictions),
            "artifact_count": len(artifacts),
            "audited_evidence_count": int(metadata.get("audited_evidence_count") or 0),
            "grounding_required": grounding_policy.required,
            "grounding_satisfied": (
                not grounding_policy.required
                or len(market_sources) >= grounding_policy.minimum_structured_sources
            ),
        },
        "performance": _bounded_research_value(performance or {}),
    }
    if evidence_profile is not None:
        recomputed_evidence_contract = (
            build_business_evidence_contract_for_grounding(
                grounding,
                evidence_profile,
            )
        )
        if prebuilt_business_evidence_contract is not None:
            evidence_contract = validate_business_evidence_contract_v1(
                prebuilt_business_evidence_contract
            )
            if evidence_contract != recomputed_evidence_contract:
                raise ValueError(
                    "preflight business evidence contract changed before bundle sealing"
                )
        else:
            evidence_contract = recomputed_evidence_contract
        owner_ledger, owner_facts = _complete_business_evidence_owner_ledger(
            grounding,
            evidence_contract["facts"],
        )
        bundle.update(
            {
                key: value
                for key, value in evidence_contract.items()
                if key not in {"quality"}
            }
        )
        bundle["quality"]["evidence_contract"] = evidence_contract["quality"][
            "evidence_contract"
        ]
        serialized_critical = bundle["quality"].get("critical_claims")
        if not isinstance(serialized_critical, dict):
            serialized_critical = {}
            bundle["quality"]["critical_claims"] = serialized_critical
        _merge_complete_business_evidence_owners(
            serialized_critical,
            emitted_facts=bundle["facts"],
            owner_ledger=owner_ledger,
            owner_facts=owner_facts,
        )
    elif prebuilt_business_evidence_contract is not None:
        raise ValueError(
            "preflight business evidence contract requires an evidence profile"
        )
    canonical_bundle = canonical_json_string(bundle)
    if len(canonical_bundle.encode("utf-8")) > MAX_RESEARCH_BUNDLE_BYTES:
        raise ValueError("Research bundle exceeds the 8 MiB Orqaly import limit")
    bundle["bundle_hash"] = hashlib.sha256(
        canonical_bundle.encode("utf-8")
    ).hexdigest()
    return bundle
