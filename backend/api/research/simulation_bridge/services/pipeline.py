"""
B2B Data Ingestion Pipeline for fetching, scraping, and scoring real-world regional company leads.
"""

import asyncio
import calendar
import copy
import hashlib
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse, urlunparse

import pycountry
from pydantic import BaseModel
from pydantic_ai import Agent, NativeOutput
from pydantic_ai.models import Model

from ..models import CompanyDiscoveryItem
from .market_scope import resolve_market_scope
from backend.services.research_source_authority_service import (
    build_authority_claim_artifact,
    build_structured_statistical_claim_artifact,
    claim_matching_offer_evidence,
    enrich_authority_sources,
    is_trusted_public_root,
    trusted_public_root_search_scope,
)
from backend.services.research_quality_service import (
    _MATERIAL_VALUE,
    evaluate_critical_claims,
    extract_material_facts,
)
from backend.services.eurostat_comext_service import (
    acquire_eurostat_comext_source,
)
from backend.services.research_topic_contract_service import (
    ConfirmedMarketScope,
    TopicSeedContract,
    ValidatedTopicAliasExpansion,
    exact_topic_phrase_in_visible_text,
    match_visible_statistical_topic,
    product_topic_phrases,
    retrieval_phrases_for_country,
    validate_expected_trusted_topic_alias_expansion,
)

logger = logging.getLogger(__name__)

_DIRECTED_EVIDENCE_CLASSES = {
    "statutory_current",
    "official_statistic",
    "observed_primary_market",
}
_MAX_SOURCES_PER_QUERY_PROVIDER = 2
_MAX_OBSERVED_CANDIDATES_PER_QUERY_PROVIDER = 6
_MAX_AUTHORITY_NETWORK_CANDIDATES = 24
_AUTHORITY_STAGE_DEADLINE_SECONDS = 50.0
_COMPANY_STRUCTURING_DEADLINE_SECONDS = 120.0
_TARGETED_ATTESTATION_SEARCH_DEADLINE_SECONDS = 90.0
_MAX_TARGETED_ATTESTATION_HOSTS = 4
_STATUTORY_RECOVERY_DEADLINE_SECONDS = 90.0
_STATUTORY_RECOVERY_SEARCH_SECONDS = 40.0
_EUROSTAT_COMEXT_STAGE_DEADLINE_SECONDS = 40.0
_STAGE_CANCELLATION_GRACE_SECONDS = 1.0
_ISO_CURRENCY_CODES = "|".join(
    sorted(re.escape(str(item.alpha_3)) for item in pycountry.currencies)
)


def _authority_retrieval_identity(url: str) -> str:
    """Canonicalize only semantics that cannot alter the HTTP retrieval."""

    try:
        parsed = urlparse(url)
        scheme = parsed.scheme.casefold()
        hostname = (parsed.hostname or "").casefold()
        port = parsed.port
    except ValueError:
        return url
    if not scheme or not hostname:
        return url
    host = hostname
    if port is not None and not (
        (scheme == "https" and port == 443)
        or (scheme == "http" and port == 80)
    ):
        host = f"{host}:{port}"
    return urlunparse((scheme, host, parsed.path, parsed.params, parsed.query, ""))


def _admit_provider_candidate_urls(
    candidate_urls: List[str],
    *,
    existing_urls: set[str],
    new_url_cap: int,
) -> tuple[str, ...]:
    """Admit bounded unique URLs without charging cross-provider duplicates."""

    admitted: List[str] = []
    admitted_identities: set[str] = set()
    known = {_authority_retrieval_identity(url) for url in existing_urls}
    new_count = 0
    scanned_identities: set[str] = set()
    for url in candidate_urls[: max(1, new_url_cap * 8)]:
        identity = _authority_retrieval_identity(url)
        if identity in admitted_identities:
            continue
        if identity not in scanned_identities:
            if len(scanned_identities) >= new_url_cap * 2:
                break
            scanned_identities.add(identity)
        if identity in known:
            admitted.append(url)
            admitted_identities.add(identity)
            continue
        if new_count >= new_url_cap:
            continue
        admitted.append(url)
        admitted_identities.add(identity)
        known.add(identity)
        new_count += 1
    return tuple(admitted)


def _schedule_authority_candidates(
    rows: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fairly order the bounded direct-fetch lane across class and provider."""

    eurostat_rows = [
        row
        for row in rows
        if str(row.get("provider") or "") == "eurostat_comext_official"
    ][:1]
    network_rows = [row for row in rows if row not in eurostat_rows]
    providers = list(
        dict.fromkeys(str(row.get("provider") or "unknown") for row in network_rows)
    )
    buckets: Dict[tuple[str, str], List[Dict[str, Any]]] = {}
    for row in network_rows:
        provider = str(row.get("provider") or "unknown")
        for evidence_class in row.get("acquisition_evidence_classes") or []:
            buckets.setdefault((provider, str(evidence_class)), []).append(row)

    scheduled: List[Dict[str, Any]] = []
    scheduled_ids: set[int] = set()

    def add(row: Optional[Dict[str, Any]]) -> None:
        if row is not None and id(row) not in scheduled_ids:
            scheduled_ids.add(id(row))
            scheduled.append(row)

    # These eight slots for two providers fit inside the fetch semaphore and
    # prevent a run of slow observed pages from starving statutory/statistical
    # authority candidates. Observed detail-page recovery remains interleaved.
    for ordinal in (0, 1):
        for provider in providers:
            bucket = buckets.get((provider, "observed_primary_market"), [])
            add(bucket[ordinal] if ordinal < len(bucket) else None)
    for evidence_class in ("statutory_current", "official_statistic"):
        for provider in providers:
            bucket = buckets.get((provider, evidence_class), [])
            add(bucket[0] if bucket else None)
    for ordinal in range(2, _MAX_OBSERVED_CANDIDATES_PER_QUERY_PROVIDER):
        for provider in providers:
            bucket = buckets.get((provider, "observed_primary_market"), [])
            add(bucket[ordinal] if ordinal < len(bucket) else None)
    for row in network_rows:
        add(row)
    return [*eurostat_rows, *scheduled[:_MAX_AUTHORITY_NETWORK_CANDIDATES]]


def _consume_background_task(task: asyncio.Task[Any]) -> None:
    """Consume a late task result without extending a caller's hard deadline."""

    try:
        task.exception()
    except (asyncio.CancelledError, Exception):
        pass


async def _await_with_hard_stage_deadline(
    awaitable: Any,
    *,
    deadline_seconds: float,
) -> Any:
    """Bound an entire stage, including a short cancellation-cleanup window.

    ``asyncio.wait_for`` may exceed its timeout while it waits for cancellation
    cleanup. Durable research needs the stage itself to have a hard budget, so
    the active work and cleanup share one deadline. Provider cancellation still
    propagates normally; a pathological late task is detached only after its
    result/exception has been made unobservable to the research bundle.
    """

    budget = max(0.01, float(deadline_seconds))
    cleanup_budget = min(
        max(0.001, _STAGE_CANCELLATION_GRACE_SECONDS),
        budget / 2,
    )
    active_budget = max(0.001, budget - cleanup_budget)
    task = asyncio.ensure_future(awaitable)
    done, _pending = await asyncio.wait({task}, timeout=active_budget)
    if task in done:
        return task.result()

    task.cancel()
    done, _pending = await asyncio.wait({task}, timeout=cleanup_budget)
    if task in done:
        try:
            task.result()
        except asyncio.CancelledError:
            pass
    else:
        task.add_done_callback(_consume_background_task)
    raise asyncio.TimeoutError


# City coordinate lookup for geo-radius search
CITY_COORDINATES = {
    "munich": (48.1351, 11.5820),
    "münchen": (48.1351, 11.5820),
    "berlin": (52.5200, 13.4050),
    "frankfurt": (50.1109, 8.6821),
    "hamburg": (53.5511, 9.9937),
    "stuttgart": (48.7758, 9.1829),
    "düsseldorf": (51.2271, 6.7735),
    "duesseldorf": (51.2271, 6.7735),
    "cologne": (50.9375, 6.9603),
    "köln": (50.9375, 6.9603),
    "nuremberg": (49.4521, 11.0767),
    "nürnberg": (49.4521, 11.0767),
    "dortmund": (51.5136, 7.4653),
    "essen": (51.4556, 7.0116),
    "leipzig": (51.3397, 12.3731),
    "dresden": (51.0504, 13.7373),
    "hannover": (52.3759, 9.7320),
    "bremen": (53.0793, 8.8017),
}


class B2BDataPipeline:
    """Ingests firmographics and reviews from APIs and scrapers to synthesize regional B2B insights."""

    def __init__(
        self, 
        location: str, 
        business_problem: str, 
        target_user: str, 
        model: Optional[Model] = None,
        data_source: str = "hybrid",
        minimum_source_count: int = 3,
        minimum_authoritative_source_count: int = 0,
        required_evidence_classes: Optional[List[str]] = None,
        topic_seed_contract: Optional[Dict[str, Any]] = None,
        topic_market_scope_contract: Optional[Dict[str, Any]] = None,
        topic_alias_expansion: Optional[Dict[str, Any]] = None,
    ):
        self.location = location
        self.business_problem = business_problem
        self.target_user = target_user
        self.model = model
        self.data_source = data_source
        self.minimum_source_count = max(1, min(int(minimum_source_count), 25))
        self.minimum_authoritative_source_count = max(
            0, min(int(minimum_authoritative_source_count), 10)
        )
        self.required_evidence_classes = [
            value
            for value in dict.fromkeys(
                str(item).casefold() for item in (required_evidence_classes or [])
            )
            if value in _DIRECTED_EVIDENCE_CLASSES
        ]
        self.topic_seed_contract = (
            TopicSeedContract.model_validate(topic_seed_contract)
            if topic_seed_contract
            else None
        )
        self.topic_market_scope_contract = (
            ConfirmedMarketScope.model_validate(topic_market_scope_contract)
            if topic_market_scope_contract
            else None
        )
        topic_contract_required = bool(
            {"official_statistic", "observed_primary_market"}
            & set(self.required_evidence_classes)
        )
        if topic_contract_required and (
            not self.topic_seed_contract or not self.topic_market_scope_contract
        ):
            raise ValueError(
                "topic-bound evidence acquisition requires a seed and confirmed "
                "market scope contract"
            )
        if bool(self.topic_seed_contract) != bool(self.topic_market_scope_contract):
            raise ValueError(
                "topic seed and confirmed market scope must propagate together"
            )
        self.topic_alias_expansion: Optional[ValidatedTopicAliasExpansion] = None
        if self.topic_seed_contract and self.topic_market_scope_contract:
            self.topic_alias_expansion = (
                validate_expected_trusted_topic_alias_expansion(
                    self.topic_seed_contract,
                    self.topic_market_scope_contract,
                    topic_alias_expansion,
                )
            )
        elif topic_alias_expansion is not None:
            raise ValueError("topic alias expansion requires a bound seed and scope")
        self.market_scope = resolve_market_scope(location)
        self.routing_diagnostics: Dict[str, Any] = {
            "requested_location": location,
            "country_code": self.market_scope.country_code,
            "locality": self.market_scope.locality,
            "providers": [],
            "rejected_cross_market": [],
            "rejected_cross_market_sources": [],
            "rejected_cross_market_claims": [],
            "rejected_invalid_sources": [],
            "required_evidence_classes": list(self.required_evidence_classes),
            "directed_queries": [],
            "topic_seed_sha256": (
                self.topic_seed_contract.seed_sha256
                if self.topic_seed_contract
                else None
            ),
            "topic_alias_expansion_sha256": (
                self.topic_alias_expansion.expansion_sha256
                if self.topic_alias_expansion
                else None
            ),
            "topic_alias_registry_id": (
                self.topic_alias_expansion.trusted_registry_id
                if self.topic_alias_expansion
                else None
            ),
            "topic_alias_registry_version": (
                self.topic_alias_expansion.trusted_registry_version
                if self.topic_alias_expansion
                else None
            ),
            "topic_mismatch_observation_count": 0,
        }
        self.market_sources: List[Dict[str, Any]] = []
        self.market_claims: List[Dict[str, Any]] = []
        self.deferred_companies: List[CompanyDiscoveryItem] = []
        
        # Load API keys
        self.apollo_key = os.getenv("APOLLO_API_KEY")
        self.northdata_key = os.getenv("NORTHDATA_API_KEY")
        self.openregister_key = os.getenv("OPENREGISTER_API_KEY")
        self.apify_token = os.getenv("APIFY_API_TOKEN")

    def _get_city_coordinates(self) -> Optional[tuple]:
        """Resolve city name to lat/lon coordinates for geo-radius search."""
        loc_lower = self.location.lower().strip()
        for city_name, coords in CITY_COORDINATES.items():
            if city_name in loc_lower:
                return coords
        return None

    async def run(self) -> List[CompanyDiscoveryItem]:
        """Runs the E2E ingestion and enrichment pipeline."""

        discovered: List[CompanyDiscoveryItem] = []
        route_tasks: List[tuple[str, Any]] = []

        # OpenRegister is a German registry. Never send an unsupported market
        # to it and never ask a model to replace the authorized geography.
        if self.data_source in ("hybrid", "registry"):
            registry_location = self.market_scope.openregister_locality
            if self.openregister_key and registry_location:
                route_tasks.append(("openregister", self._fetch_from_openregister()))
            else:
                self._record_provider(
                    "openregister",
                    attempted=False,
                    accepted=0,
                    reason=(
                        "unsupported_market"
                        if self.openregister_key
                        else "not_configured"
                    ),
                )

        # Hybrid mode intentionally adds current web evidence even when a
        # registry returns rows. A single provider must not silently satisfy a
        # deep-research contract without source diversity.
        if self.data_source in ("hybrid", "web"):
            logger.info(
                "Discovering via market-aware web grounding for %s.", self.location
            )
            route_tasks.append(("web", self._discover_via_web_search()))

        # Registry and web retrieval are independent evidence routes. Running
        # them together shortens retrieval without removing either provider.
        route_results = await asyncio.gather(
            *(task for _provider, task in route_tasks), return_exceptions=True
        )
        for (provider, _task), result in zip(route_tasks, route_results):
            if isinstance(result, BaseException):
                self._record_provider(
                    provider,
                    attempted=True,
                    accepted=0,
                    reason=f"provider_error:{type(result).__name__}",
                )
                continue
            accepted = self._accept_market_companies(result, provider=provider)
            discovered.extend(accepted)
            if provider == "openregister":
                self._record_provider(provider, attempted=True, accepted=len(accepted))

        companies = self._deduplicate_companies(discovered)
        self.routing_diagnostics["accepted_company_count"] = len(companies)
        if not companies:
            logger.warning(
                "All market-compatible discovery methods exhausted for %s.",
                self.location,
            )
            return []

        if self.required_evidence_classes:
            # Critical evidence is evaluated by the durable run before these
            # expensive non-critical enrichments. A failed class gate therefore
            # does not spend another contact/pain search round.
            self.deferred_companies = companies
            self.routing_diagnostics["company_enrichment_status"] = (
                "deferred_until_critical_gate"
            )
            return companies

        # Contact discovery and pain-point evidence read the same bounded
        # company snapshot but populate disjoint fields. Running the two batch
        # routes together removes one full search+parse latency chain without
        # reducing evidence, sources, or output detail.
        await asyncio.gather(
            self._enrich_contacts_and_people(companies),
            self._enrich_with_grounded_pain_points(companies),
        )
        return companies

    async def complete_deferred_company_enrichment(
        self,
    ) -> List[CompanyDiscoveryItem]:
        companies = list(self.deferred_companies)
        if not companies:
            return []
        await asyncio.gather(
            self._enrich_contacts_and_people(companies),
            self._enrich_with_grounded_pain_points(companies),
        )
        self.deferred_companies = []
        self.routing_diagnostics["company_enrichment_status"] = "completed_after_gate"
        return companies

    def _record_provider(
        self,
        provider: str,
        *,
        attempted: bool,
        accepted: int,
        source_count: int = 0,
        reason: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        row = {
            "provider": provider,
            "attempted": attempted,
            "accepted_company_count": accepted,
            "source_count": source_count,
            "reason": reason,
        }
        if details:
            row.update(details)
        self.routing_diagnostics["providers"].append(row)

    def _bounded_research_topic(self, value: str, maximum: int) -> str:
        """Remove prior-routing narratives and foreign country names from queries."""

        requested_code = self.market_scope.country_code
        foreign_names: set[str] = set()
        for country in pycountry.countries:
            if str(country.alpha_2) == requested_code:
                continue
            for field in ("name", "official_name", "common_name"):
                name = getattr(country, field, None)
                if name and len(str(name)) >= 4:
                    foreign_names.add(str(name).casefold())
        retained = []
        for sentence in re.split(r"(?<=[.!?])\s+|[\r\n]+", str(value or "")):
            lower = sentence.casefold()
            if re.search(
                r"\b(?:prior|previous|wrong|incorrect|leak(?:age)?|fallback|"
                r"failure|failed|do not route|must not route)\b",
                lower,
            ):
                continue
            if any(re.search(rf"\b{re.escape(name)}\b", lower) for name in foreign_names):
                continue
            if sentence.strip():
                retained.append(" ".join(sentence.split()))
        topic = " ".join(retained).strip()
        return (topic or "commercial market need described by the goal")[:maximum]

    def _directed_evidence_queries(self) -> List[Dict[str, str]]:
        """Build dynamic class-specific retrieval queries for this market.

        Query wording describes source/evidence properties rather than naming
        any country's agencies or truth values. Providers remain free to find
        the correct local authority, statistics office, or commercial
        publisher for the resolved jurisdiction.
        """

        market = self.location.strip()
        problem = self._bounded_research_topic(self.business_problem, 700)
        target = self._bounded_research_topic(self.target_user, 300)
        product_topics = (
            retrieval_phrases_for_country(
                self.topic_seed_contract,
                country_code=str(self.market_scope.country_code),
                expansion=self.topic_alias_expansion,
                product_only=True,
            )[:8]
            if self.topic_seed_contract and self.market_scope.country_code
            else ()
        )
        product_topic_clause = (
            "Exact product/category phrases: " + ", ".join(product_topics) + ". "
            if product_topics
            else ""
        )
        fragments = {
            "statutory_current": (
                f"{market} official national tax authority current standard VAT GST "
                f"sales or consumption tax rate and effective date for: {problem}. "
                "Also include an applicable official product regulator rule only when "
                "it states an exact current numeric threshold, rate, deadline, or a "
                "dated legal obligation. Return direct current authority pages, not "
                "historic consolidations, summaries, directories, or news pages; the "
                "exact material rule/value and effective date must appear on the page."
            ),
            "official_statistic": (
                f"{market} latest official statistics government statistics office "
                "market population demand retail sales. "
                + product_topic_clause
                +
                "Return the direct latest-release dataset/page with exact observation "
                "period, value, unit, and explicit latest/current release language."
            ),
            "observed_primary_market": (
                f"{market} current first-party retailer distributor supplier product "
                "catalogue price in local currency local market. "
                + product_topic_clause
                +
                "Return direct product-detail pages from publishers operating in the "
                "market where one concrete visible product and its current price, "
                "currency, and availability are bound in a schema.org Product/Offer "
                "or equivalent product card. Exclude homepages and category/search "
                "pages that do not expose a concrete current product offer."
            ),
        }
        return [
            {"evidence_class": evidence_class, "query": fragments[evidence_class]}
            for evidence_class in self.required_evidence_classes
            if evidence_class in fragments
        ]

    def _rank_provider_sources_for_topic(
        self,
        evidence_class: str,
        sources: List[Dict[str, Any]],
        claims: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Stable-rank observed results by exact immutable product phrases.

        Ranking happens before the per-route cap. Only a source's own title and
        claims explicitly linked to that URL participate; the shared provider
        query is intentionally excluded so unrelated results cannot tie on it.
        """

        if evidence_class not in {
            "observed_primary_market",
            "official_statistic",
        } or not self.topic_seed_contract:
            return list(sources)
        phrases = retrieval_phrases_for_country(
            self.topic_seed_contract,
            country_code=str(self.market_scope.country_code),
            expansion=self.topic_alias_expansion,
            product_only=True,
        )
        if not phrases:
            return list(sources)

        ranked: list[tuple[int, int, Dict[str, Any]]] = []
        for index, source in enumerate(sources):
            url = str(source.get("url") or "")
            linked_text = " ".join(
                str(claim.get("text") or claim.get("object") or "")
                for claim in claims
                if url and url in {str(value) for value in claim.get("source_urls") or []}
            )
            visible_text = " ".join(
                value for value in (str(source.get("title") or ""), linked_text) if value
            )
            score = sum(
                1
                for phrase in phrases
                if exact_topic_phrase_in_visible_text(visible_text, phrase)
            )
            ranked.append((score, index, source))
        ranked.sort(key=lambda row: (-row[0], row[1]))
        return [row[2] for row in ranked]

    def _authority_attestation_query(self) -> Dict[str, str]:
        market = self.location.strip()
        return {
            "evidence_class": "authority_attestation",
            "query": (
                f"{market} official government or supranational public authority "
                "directory for the national tax regulator and official statistics "
                "publisher. Return direct government or EU directory pages that name "
                "and link the authority publisher domains. Authorized market only."
            ),
        }

    def _provisional_statutory_claim_count(self) -> int:
        """Count only facts that pass the actual signed authority/span gate."""

        quality = evaluate_critical_claims(
            {
                "market_sources": self.market_sources,
                "market_claims": self.market_claims,
            },
            [self.market_scope.country_code]
            if self.market_scope.country_code
            else [],
            mandatory_claim_classes=["statutory_current"],
            claim_class_applicability={
                "applicable_claim_classes": ["statutory_current"]
            },
        )
        return sum(
            row.get("evidence_class") == "statutory_current"
            and row.get("status") == "verified_current_authoritative"
            for row in quality.get("claims") or []
        )

    def _recovery_search_services(
        self,
        search_services: List[tuple[str, Any]],
    ) -> List[tuple[str, Any]]:
        """Skip a secondary route proven unhealthy by the initial class call."""

        healthy: List[tuple[str, Any]] = []
        provider_rows = self.routing_diagnostics.get("providers") or []
        for provider, service in search_services:
            matching = [
                row
                for row in provider_rows
                if isinstance(row, dict)
                and row.get("provider") == f"{provider}:statutory_current"
            ]
            if not matching:
                healthy.append((provider, service))
                continue
            row = matching[-1]
            runtime = row.get("runtime") or {}
            engines = runtime.get("unresponsive_engines") or []
            runtime_status = str(runtime.get("status") or "").casefold()
            reason = str(row.get("reason") or "").casefold()
            unhealthy = (
                int(row.get("source_count") or 0) == 0
                and (
                    bool(engines)
                    or runtime_status
                    in {
                        "failed", "deadline_exceeded", "timeout", "unavailable",
                        "configuration_error", "rate_limited",
                    }
                    or int(runtime.get("http_status") or 0) in {403, 429, 500, 502, 503, 504}
                    or reason.startswith("provider_error:")
                )
            )
            if unhealthy:
                self._record_provider(
                    f"{provider}:statutory_recovery",
                    attempted=False,
                    accepted=0,
                    reason="unhealthy_initial_route",
                    details={"evidence_class": "statutory_recovery"},
                )
                continue
            healthy.append((provider, service))
        return healthy

    async def _recover_missing_statutory_evidence(
        self,
        search_services: List[tuple[str, Any]],
        source_rows: List[Dict[str, Any]],
    ) -> int:
        """Run one bounded, dynamic recovery query per healthy provider.

        Recovery is reached only after exact direct-document extraction found no
        material statutory fact. It reuses the same fetch, jurisdiction,
        authority-proof and exact-span pipeline as primary acquisition.
        """

        if self._provisional_statutory_claim_count():
            return 0
        services = self._recovery_search_services(search_services)
        if not services:
            self.routing_diagnostics["statutory_recovery"] = {
                "status": "no_healthy_provider",
                "route_count": 0,
                "candidate_count": 0,
                "accepted_verified_claims": 0,
                "elapsed_ms": 0,
                "deadline_ms": int(_STATUTORY_RECOVERY_DEADLINE_SECONDS * 1000),
            }
            return 0

        market = self.location.strip()
        problem = self._bounded_research_topic(self.business_problem, 500)
        country_codes = (
            [self.market_scope.country_code]
            if self.market_scope.country_code
            else []
        )
        root_scope = trusted_public_root_search_scope(country_codes)
        query = (
            f"{market} official national tax authority current standard VAT GST "
            "sales or consumption tax rate effective date. Return the direct "
            "current tax-authority fact page and, where the national publisher "
            f"is not on a recognized government root, a {root_scope} official "
            "directory or supranational page that names/links that publisher. "
            "The page must contain the exact current material rate/rule and "
            f"effective date. Goal context: {problem}"
        )
        query_id = self._evidence_id("query", query)
        started = time.monotonic()
        logger.info(
            "Missing statutory evidence recovery started; routes=%s deadline_ms=%s",
            len(services),
            int(_STATUTORY_RECOVERY_DEADLINE_SECONDS * 1000),
        )

        async def run(provider: str, service: Any):
            try:
                result = await asyncio.to_thread(service.search_web_general, query)
                return provider, result
            except Exception as exc:
                return provider, exc

        try:
            results = await _await_with_hard_stage_deadline(
                asyncio.gather(*(run(provider, service) for provider, service in services)),
                deadline_seconds=_STATUTORY_RECOVERY_SEARCH_SECONDS,
            )
            search_status = "completed"
        except asyncio.TimeoutError:
            results = []
            search_status = "search_timeout"

        candidates: List[Dict[str, Any]] = []
        seen_urls = {str(row.get("url") or "") for row in source_rows}
        for provider, result in results:
            if isinstance(result, BaseException):
                self._record_provider(
                    f"{provider}:statutory_recovery",
                    attempted=True,
                    accepted=0,
                    reason=f"provider_error:{type(result).__name__}",
                    details={"evidence_class": "statutory_recovery", "query_id": query_id},
                )
                continue
            accepted = 0
            provider_sources = [
                row for row in result.get("sources") or [] if isinstance(row, dict)
            ]
            for source in provider_sources:
                if accepted >= _MAX_SOURCES_PER_QUERY_PROVIDER:
                    break
                url = str(source.get("url") or "").strip()
                parsed = urlparse(url)
                if (
                    not url
                    or url in seen_urls
                    or parsed.scheme.casefold() != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or not self.market_scope.source_url_matches(url)
                ):
                    continue
                seen_urls.add(url)
                accepted += 1
                candidates.append(
                    {
                        "title": str(source.get("title") or "Current tax authority")[:500],
                        "url": url,
                        "provider": provider,
                        "provider_source_id": source.get("provider_source_id"),
                        "retrieved_at": source.get("retrieved_at"),
                        "provider_response_hash": source.get("provider_response_hash"),
                        "provider_query_ids": list(
                            source.get("provider_query_ids") or [query_id]
                        ),
                        "provider_queries": list(source.get("provider_queries") or [query]),
                        "citation_metadata": source.get("citation_metadata") or {},
                        "provider_redirect": bool(source.get("provider_redirect")),
                        "country_codes": country_codes,
                        "market_terms": list(
                            dict.fromkeys(
                                value
                                for value in (
                                    self.location,
                                    self.market_scope.locality,
                                    self.market_scope.country_name,
                                )
                                if value
                            )
                        ),
                        "acquisition_evidence_classes": ["statutory_current"],
                    }
                )
            runtime = result.get("runtime_diagnostics") or {}
            self._record_provider(
                f"{provider}:statutory_recovery",
                attempted=True,
                accepted=0,
                source_count=accepted,
                reason=None if accepted else "empty_or_failed",
                details={
                    "evidence_class": "statutory_recovery",
                    "query_id": query_id,
                    "result_source_count": len(provider_sources),
                    "runtime": {
                        key: runtime.get(key)
                        for key in (
                            "route", "model", "status", "elapsed_ms", "call_count",
                            "retry_count", "deadline_ms", "fallback_used", "http_status",
                            "result_count", "unresponsive_engines",
                        )
                        if runtime.get(key) is not None
                    },
                },
            )

        remaining = _STATUTORY_RECOVERY_DEADLINE_SECONDS - (
            time.monotonic() - started
        )
        recovery_status = search_status
        enriched: List[Dict[str, Any]] = []
        if candidates and remaining > 1:
            try:
                enriched = await _await_with_hard_stage_deadline(
                    enrich_authority_sources(candidates),
                    deadline_seconds=min(_AUTHORITY_STAGE_DEADLINE_SECONDS, remaining),
                )
            except asyncio.TimeoutError:
                recovery_status = "authority_timeout"
            else:
                recovery_status = "completed"
                eligible = [
                    row
                    for row in enriched
                    if row.get("jurisdiction_binding_status") == "verified"
                    and row.get("authority_proof")
                ]
                self._store_direct_web_evidence(eligible, [])
                source_rows.extend(eligible)

        accepted_claims = self._provisional_statutory_claim_count()
        elapsed_ms = int((time.monotonic() - started) * 1000)
        self.routing_diagnostics["statutory_recovery"] = {
            "status": recovery_status,
            "route_count": len(services),
            "candidate_count": len(candidates),
            "retrieved_count": sum(
                row.get("direct_fetch_status") == "retrieved" for row in enriched
            ),
            "verified_count": sum(bool(row.get("authority_proof")) for row in enriched),
            "accepted_verified_claims": accepted_claims,
            "elapsed_ms": elapsed_ms,
            "deadline_ms": int(_STATUTORY_RECOVERY_DEADLINE_SECONDS * 1000),
        }
        logger.info(
            "Missing statutory evidence recovery finished; status=%s elapsed_ms=%s "
            "candidates=%s accepted_verified_claims=%s",
            recovery_status,
            elapsed_ms,
            len(candidates),
            accepted_claims,
        )
        return accepted_claims

    async def _targeted_authority_attestation_sources(
        self,
        unresolved_rows: List[Dict[str, Any]],
        search_services: List[tuple[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Find trusted-root pages that name unresolved direct publishers.

        The initial general directory query cannot know which publisher hosts
        provider redirects will resolve to. This bounded second pass searches
        for each exact unresolved hostname after resolution. Search output does
        not grant authority: the returned page must still be fetched from a
        recognized public root and its visible text must name the exact direct
        hostname before the HMAC authority proof can be built.
        """

        host_rows: List[tuple[str, Dict[str, Any]]] = []
        seen_hosts: set[str] = set()
        for row in unresolved_rows:
            if str(row.get("jurisdiction_binding_status") or "").startswith(
                "rejected"
            ):
                continue
            host = (
                urlparse(str(row.get("resolved_url") or row.get("url") or "")).hostname
                or ""
            ).casefold()
            if not host or host in seen_hosts:
                continue
            seen_hosts.add(host)
            host_rows.append((host, row))
            if len(host_rows) >= _MAX_TARGETED_ATTESTATION_HOSTS:
                break
        if not host_rows or not search_services:
            return []

        market = self.location.strip()
        country_codes = [self.market_scope.country_code] if self.market_scope.country_code else []
        root_scope = trusted_public_root_search_scope(country_codes)
        query_rows = [
            {
                "host": host,
                "query": (
                    f"{root_scope} {market} official public authority directory exact "
                    f'publisher hostname "{host}". Return a direct recognized government '
                    "or supranational directory page whose visible text names or links the "
                    f'exact hostname "{host}". Do not return the publisher page itself.'
                ),
            }
            for host, _row in host_rows
        ]
        logger.info(
            "Targeted authority attestation search started; hosts=%s routes=%s deadline_ms=%s",
            len(query_rows),
            len(query_rows) * len(search_services),
            int(_TARGETED_ATTESTATION_SEARCH_DEADLINE_SECONDS * 1000),
        )

        async def run(
            provider: str,
            service: Any,
            query_row: Dict[str, str],
        ) -> tuple[str, Dict[str, str], Dict[str, Any] | BaseException]:
            try:
                result = await asyncio.to_thread(
                    service.search_web_general,
                    query_row["query"],
                )
                return provider, query_row, result
            except Exception as exc:
                return provider, query_row, exc

        started = time.monotonic()
        try:
            results = await _await_with_hard_stage_deadline(
                asyncio.gather(
                    *(
                        run(provider, service, query_row)
                        for provider, service in search_services
                        for query_row in query_rows
                    )
                ),
                deadline_seconds=_TARGETED_ATTESTATION_SEARCH_DEADLINE_SECONDS,
            )
            status = "completed"
        except asyncio.TimeoutError:
            results = []
            status = "timeout"

        candidates: List[Dict[str, Any]] = []
        seen_urls: set[str] = set()
        for provider, query_row, result in results:
            query_id = self._evidence_id("query", query_row["query"])
            if isinstance(result, BaseException):
                self._record_provider(
                    f"{provider}:targeted_authority_attestation",
                    attempted=True,
                    accepted=0,
                    reason=f"provider_error:{type(result).__name__}",
                    details={
                        "evidence_class": "targeted_authority_attestation",
                        "query_id": query_id,
                    },
                )
                continue
            sources = [row for row in result.get("sources") or [] if isinstance(row, dict)]
            accepted = 0
            for source in sources:
                if accepted >= 1:
                    break
                url = str(source.get("url") or "").strip()
                parsed = urlparse(url)
                if (
                    not url
                    or url in seen_urls
                    or parsed.scheme.casefold() != "https"
                    or not parsed.hostname
                    or parsed.username
                    or parsed.password
                    or not self.market_scope.source_url_matches(url)
                ):
                    continue
                seen_urls.add(url)
                accepted += 1
                candidates.append(
                    {
                        "title": str(source.get("title") or "Authority directory")[:500],
                        "url": url,
                        "provider": provider,
                        "provider_source_id": source.get("provider_source_id"),
                        "retrieved_at": source.get("retrieved_at"),
                        "provider_response_hash": source.get("provider_response_hash"),
                        "provider_query_ids": list(
                            source.get("provider_query_ids") or [query_id]
                        ),
                        "provider_queries": list(
                            source.get("provider_queries") or [query_row["query"]]
                        ),
                        "citation_metadata": source.get("citation_metadata") or {},
                        "provider_redirect": bool(source.get("provider_redirect")),
                        "country_codes": country_codes,
                        "market_terms": list(
                            dict.fromkeys(
                                value
                                for value in (
                                    self.location,
                                    self.market_scope.locality,
                                    self.market_scope.country_name,
                                )
                                if value
                            )
                        ),
                        "acquisition_evidence_classes": ["authority_attestation"],
                        "target_authority_host": query_row["host"],
                    }
                )
            runtime = result.get("runtime_diagnostics") or {}
            self._record_provider(
                f"{provider}:targeted_authority_attestation",
                attempted=True,
                accepted=0,
                source_count=accepted,
                reason=None if accepted else "empty_or_failed",
                details={
                    "evidence_class": "targeted_authority_attestation",
                    "query_id": query_id,
                    "result_source_count": len(sources),
                    "runtime": {
                        key: runtime.get(key)
                        for key in (
                            "route",
                            "model",
                            "status",
                            "elapsed_ms",
                            "call_count",
                            "retry_count",
                            "deadline_ms",
                            "fallback_used",
                            "http_status",
                            "result_count",
                            "unresponsive_engines",
                        )
                        if runtime.get(key) is not None
                    },
                },
            )
        elapsed_ms = int((time.monotonic() - started) * 1000)
        self.routing_diagnostics["targeted_authority_attestation"] = {
            "status": status,
            "host_count": len(query_rows),
            "route_count": len(query_rows) * len(search_services),
            "candidate_count": len(candidates),
            "elapsed_ms": elapsed_ms,
            "deadline_ms": int(_TARGETED_ATTESTATION_SEARCH_DEADLINE_SECONDS * 1000),
        }
        logger.info(
            "Targeted authority attestation search finished; status=%s elapsed_ms=%s "
            "candidates=%s",
            status,
            elapsed_ms,
            len(candidates),
        )
        return candidates

    @staticmethod
    def _evidence_id(prefix: str, value: str) -> str:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]
        return f"{prefix}-{digest}"

    @staticmethod
    def _source_authority(url: str, *, provider: Optional[str] = None) -> str:
        hostname = (urlparse(url).hostname or "").casefold()
        if provider == "gemini_google_search" or any(
            token in hostname
            for token in ("vertexaisearch.cloud.google.com", "googleusercontent.com")
        ):
            return "unverified_redirect"
        if is_trusted_public_root(url):
            return "official_public"
        if hostname.endswith((".edu", ".ac.uk")):
            return "academic"
        return "independent_web"

    @staticmethod
    def _direct_claim_semantics(
        text: str,
        *,
        direct_document_text: str,
        retrieved_at: Optional[str],
    ) -> Dict[str, Any]:
        """Fail-closed deterministic metadata from the exact direct quote.

        This never paraphrases or invents a date. Missing temporal language is
        intentionally left missing so the critical validator blocks it.
        """

        lower = text.casefold()
        result: Dict[str, Any] = {
            "critical": bool(
                re.search(
                    r"\b(?:vat|tax|gst|duty|tariff|regulation|legal|law|"
                    r"compliance|price|cost|fee|market size|population|growth rate|"
                    r"sales|turnover|households|consumption|imports|exports|volume)\b",
                    lower,
                )
            )
        }
        if re.search(
            r"\b(?:vat|tax|gst|duty|tariff|regulation|legal|law|compliance)\b",
            lower,
        ):
            result["evidence_class"] = "statutory_current"
        elif re.search(
            r"\b(?:market size|population|growth rate|employment|inflation|"
            r"sales|turnover|households|consumption|imports|exports|volume|"
            r"(?:consumer|producer|construction|retail)?\s*price\s+index|"
            r"cpi|ppi)\b",
            lower,
        ):
            result["evidence_class"] = "official_statistic"
        elif re.search(r"\b(?:price|cost|fee|retail|catalog|supplier)\b", lower):
            result["evidence_class"] = "observed_primary_market"
        elif re.search(
            rf"(?:[{re.escape('€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾')}]\s*\d|"
            rf"\b(?:{_ISO_CURRENCY_CODES})\s*\d|"
            rf"\b\d[\d\s.,]*\s*(?:{_ISO_CURRENCY_CODES}|euros?|dollars?|"
            rf"pounds?|yen|yuan|rupees?|[{re.escape('€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾')}]))",
            text,
            re.IGNORECASE,
        ):
            result["evidence_class"] = "observed_primary_market"
            result["critical"] = True
        else:
            return result

        evidence_class = result["evidence_class"]

        effective_dotted = re.search(
            r"\b(?:effective|entry\s+into\s+force|applies?|from)\D{0,40}"
            r"(\d{1,2})\.(\d{1,2})\.(20\d{2})\b",
            text,
            re.IGNORECASE,
        )
        iso_date = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", text)
        dotted_date = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b", text)
        day_month_date = re.search(
            r"\b(\d{1,2})\s+(january|february|march|april|may|june|july|"
            r"august|september|october|november|december)\s+(20\d{2})\b",
            lower,
        )
        month_date = re.search(
            r"\b(january|february|march|april|may|june|july|august|"
            r"september|october|november|december)\s+(\d{1,2},?\s+)?(20\d{2})\b",
            lower,
        )
        year = re.search(r"\b(20\d{2})\b", text)
        effective = None
        try:
            if effective_dotted:
                effective = datetime(
                    int(effective_dotted.group(3)),
                    int(effective_dotted.group(2)),
                    int(effective_dotted.group(1)),
                    tzinfo=timezone.utc,
                ).isoformat()
            elif iso_date:
                # Validate before retaining a syntactically ISO-shaped table
                # token such as 2026-99-16.
                effective = datetime.fromisoformat(
                    iso_date.group(1)
                ).replace(tzinfo=timezone.utc).isoformat()
            elif dotted_date:
                effective = datetime(
                    int(dotted_date.group(3)),
                    int(dotted_date.group(2)),
                    int(dotted_date.group(1)),
                    tzinfo=timezone.utc,
                ).isoformat()
            elif day_month_date:
                effective = datetime(
                    int(day_month_date.group(3)),
                    datetime.strptime(day_month_date.group(2), "%B").month,
                    int(day_month_date.group(1)),
                    tzinfo=timezone.utc,
                ).isoformat()
            elif month_date:
                month = datetime.strptime(month_date.group(1), "%B").month
                day_text = (month_date.group(2) or "1").replace(",", "").strip()
                effective = datetime(
                    int(month_date.group(3)), month, int(day_text), tzinfo=timezone.utc
                ).isoformat()
            elif year:
                effective = datetime(
                    int(year.group(1)), 1, 1, tzinfo=timezone.utc
                ).isoformat()
        except ValueError:
            # Flattened tables routinely contain date-like numeric cells. An
            # invalid incidental match is not evidence and must be ignored,
            # never allowed to crash direct structured evidence consumption.
            effective = None

        if evidence_class == "official_statistic":
            # Publication metadata must be attached to an explicit release
            # marker. Dates elsewhere in a flattened table are observations or
            # cell values and must never become the publication timestamp.
            release_day_month = re.search(
                r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
                r"released\s+on)\D{0,30}(\d{1,2})\s+"
                r"(january|february|march|april|may|june|july|august|"
                r"september|october|november|december)\s+(20\d{2})\b",
                lower,
            )
            release_iso = re.search(
                r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
                r"released\s+on)\D{0,30}(20\d{2}-\d{2}-\d{2})\b",
                lower,
            )
            release_dotted = re.search(
                r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
                r"released\s+on)\D{0,30}(\d{1,2})\.(\d{1,2})\.(20\d{2})\b",
                lower,
            )
            release_month_day = re.search(
                r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
                r"released\s+on)\D{0,30}"
                r"(january|february|march|april|may|june|july|august|"
                r"september|october|november|december)\s+(\d{1,2}),?\s+"
                r"(20\d{2})\b",
                lower,
            )
            if release_day_month:
                effective = datetime(
                    int(release_day_month.group(3)),
                    datetime.strptime(release_day_month.group(2), "%B").month,
                    int(release_day_month.group(1)),
                    tzinfo=timezone.utc,
                ).isoformat()
            elif release_iso:
                effective = f"{release_iso.group(1)}T00:00:00+00:00"
            elif release_dotted:
                effective = datetime(
                    int(release_dotted.group(3)),
                    int(release_dotted.group(2)),
                    int(release_dotted.group(1)),
                    tzinfo=timezone.utc,
                ).isoformat()
            elif release_month_day:
                effective = datetime(
                    int(release_month_day.group(3)),
                    datetime.strptime(release_month_day.group(1), "%B").month,
                    int(release_month_day.group(2)),
                    tzinfo=timezone.utc,
                ).isoformat()
            else:
                effective = None

        if evidence_class == "statutory_current":
            if effective:
                result["effective_at"] = effective
            result["current"] = bool(
                re.search(
                    r"\b(?:current|currently|effective|from|is|are|in force|"
                    r"entry into force|applies)\b",
                    lower,
                )
                and not re.search(r"\b(?:former|previous|repealed|superseded|until)\b", lower)
            )
        elif evidence_class == "official_statistic":
            # Observation time is not publication time. Prefer an exact
            # publisher-stated ``as at`` date or completed period; never turn a
            # current partial year into a fabricated 31 December observation.
            as_at_dates = list(re.finditer(
                r"\b(?:as\s+at|as\s+of)\s+(\d{1,2})\s+"
                r"(january|february|march|april|may|june|july|august|"
                r"september|october|november|december)\s+(20\d{2})\b",
                lower,
            ))
            quarter_matches = list(re.finditer(
                r"\b(?:q([1-4])|([1-4])(?:st|nd|rd|th)\s+quarter|"
                r"(first|second|third|fourth)\s+quarter)"
                r"(?:\s+of)?\s+(20\d{2})\b",
                lower,
            ))
            observation_month_matches = list(re.finditer(
                r"\b(?:in|for|during|as\s+at|as\s+of|month\s+of)\s+"
                r"(january|february|march|april|may|june|july|august|"
                r"september|october|november|december)\s+(20\d{2})\b",
                lower,
            ))
            observation_year_matches = list(re.finditer(
                r"\b(?:in|for|during)\s+(20\d{2})\b", lower
            ))
            document_years = [
                int(value) for value in re.findall(r"\b(20\d{2})\b", direct_document_text)
            ]
            observation_candidates: List[datetime] = []
            observation_candidates.extend(
                datetime(
                    int(match.group(3)),
                    datetime.strptime(match.group(2), "%B").month,
                    int(match.group(1)),
                    tzinfo=timezone.utc,
                )
                for match in as_at_dates
            )
            quarter_words = {
                "first": 1,
                "second": 2,
                "third": 3,
                "fourth": 4,
            }
            for match in quarter_matches:
                quarter = int(
                    match.group(1)
                    or match.group(2)
                    or quarter_words[str(match.group(3))]
                )
                quarter_month = quarter * 3
                quarter_year = int(match.group(4))
                observation_candidates.append(
                    datetime(
                        quarter_year,
                        quarter_month,
                        calendar.monthrange(quarter_year, quarter_month)[1],
                        tzinfo=timezone.utc,
                    )
                )
            for match in observation_month_matches:
                observation_year = int(match.group(2))
                observation_month = datetime.strptime(match.group(1), "%B").month
                observation_candidates.append(
                    datetime(
                        observation_year,
                        observation_month,
                        calendar.monthrange(observation_year, observation_month)[1],
                        tzinfo=timezone.utc,
                    )
                )
            publication_time = datetime.fromisoformat(effective) if effective else None
            for match in observation_year_matches:
                observation_year = int(match.group(1))
                candidate_end = datetime(observation_year, 12, 31, tzinfo=timezone.utc)
                # A completed prior year is a defensible annual observation.
                # A current partial year needs a quarter/month/as-at marker.
                if publication_time and candidate_end <= publication_time:
                    observation_candidates.append(candidate_end)

            if effective:
                result["published_at"] = effective
            retrieval_time = None
            if retrieved_at:
                try:
                    retrieval_time = datetime.fromisoformat(
                        retrieved_at.replace("Z", "+00:00")
                    )
                except ValueError:
                    retrieval_time = None
            temporal_ceiling = min(
                value
                for value in (publication_time, retrieval_time, datetime.now(timezone.utc))
                if value is not None
            )
            eligible_observations = [
                value for value in observation_candidates if value <= temporal_ceiling
            ]
            if eligible_observations:
                result["observation_end"] = max(eligible_observations).isoformat()
            result["latest_release"] = bool(
                effective
                and result.get("observation_end")
                and document_years
                and int(effective[:4]) == max(document_years)
                and re.search(
                    r"\b(?:latest|most recent|current release|last updated|updated|"
                    r"posted on|published|data as at)\b",
                    lower,
                )
            )
            result["latest_release_basis"] = (
                "explicit_latest_language_and_max_year_in_direct_document"
                if result["latest_release"]
                else "not_proven"
            )
        elif evidence_class == "observed_primary_market" and retrieved_at:
            result["observed_at"] = retrieved_at
        result["semantic_extraction"] = "deterministic_exact_direct_quote_v1"
        return result

    @classmethod
    def _direct_document_claim_passages(
        cls,
        text: str,
        *,
        retrieved_at: Optional[str],
        maximum_passages: int = 12,
    ) -> List[Dict[str, Any]]:
        """Extract exact, consequential passages from a fetched document.

        Search-provider answers are often faithful paraphrases, but a
        paraphrase cannot serve as an exact citation.  This deterministic
        stage selects one- and two-sentence spans directly from the normalized
        fetched document.  It never rewrites the publisher's words and only
        promotes spans whose class-specific currentness metadata can be proven
        from the span/document itself.
        """

        normalized = " ".join(str(text or "").split())
        if not normalized:
            return []
        material_value = _MATERIAL_VALUE
        sentences = [
            value.strip()
            for value in re.split(r"(?<=[.!?])\s+", normalized)
            if value.strip()
        ]
        candidates: List[tuple[str, tuple[int, ...]]] = [
            (sentence, (index,)) for index, sentence in enumerate(sentences)
        ]
        candidates.extend(
            (f"{sentences[index]} {sentences[index + 1]}", (index, index + 1))
            for index in range(max(0, len(sentences) - 1))
        )
        # Statistical portals commonly normalize tables/cards into one long
        # punctuation-free text block. Build bounded exact windows from explicit
        # publication/latest markers instead of discarding the entire >1,200
        # character block. Each window remains a verbatim substring of the
        # signed document and must still pass the same material-value, semantic,
        # temporal, and authority checks below.
        publication_marker = re.compile(
            r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
            r"data\s+as\s+at|release(?:d)?\s+on)\b",
            re.IGNORECASE,
        )
        # ``data as at`` can occur inside a card headed by ``last updated``;
        # it is an observation marker, not the beginning of a new card. Only
        # actual release/update headers delimit adjacent table/card windows.
        publication_boundary = re.compile(
            r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
            r"release(?:d)?\s+on)\b",
            re.IGNORECASE,
        )
        for marker_index, marker in enumerate(
            publication_marker.finditer(normalized)
        ):
            next_marker = publication_boundary.search(normalized, marker.end())
            start = max(0, marker.start() - 80)
            if start:
                preceding_space = normalized.find(" ", start)
                if 0 <= preceding_space < marker.start():
                    start = preceding_space + 1
            end = min(
                len(normalized),
                start + 1_200,
                next_marker.start() if next_marker else len(normalized),
            )
            if end < len(normalized):
                preceding_space = normalized.rfind(" ", marker.end(), end)
                if preceding_space > marker.end():
                    end = preceding_space
            window = normalized[start:end].strip()
            if window:
                candidates.append((window, (-marker_index - 1,)))

        # Some government/CMS and catalogue pages normalize navigation plus
        # the first content card into one multi-thousand-character sentence.
        # A sentence-only parser then discards a perfectly exact fact solely
        # because unrelated navigation precedes it. Build a bounded verbatim
        # window around each material value, preferring nearby punctuation.
        # This does not rewrite or infer a quote: the window remains an exact
        # substring of the signed direct document and must pass all semantic,
        # temporal, jurisdiction and authority checks below.
        for value_index, match in enumerate(material_value.finditer(normalized)):
            left_floor = max(0, match.start() - 320)
            right_ceiling = min(len(normalized), match.end() + 480)
            punctuation_start = max(
                normalized.rfind(". ", left_floor, match.start()),
                normalized.rfind("! ", left_floor, match.start()),
                normalized.rfind("? ", left_floor, match.start()),
            )
            start = punctuation_start + 2 if punctuation_start >= 0 else left_floor
            if start == left_floor and start:
                next_space = normalized.find(" ", start, match.start())
                if next_space >= 0:
                    start = next_space + 1
            punctuation_ends = [
                value
                for value in (
                    normalized.find(". ", match.end(), right_ceiling),
                    normalized.find("! ", match.end(), right_ceiling),
                    normalized.find("? ", match.end(), right_ceiling),
                )
                if value >= 0
            ]
            end = min(punctuation_ends) + 1 if punctuation_ends else right_ceiling
            if end == right_ceiling and end < len(normalized):
                previous_space = normalized.rfind(" ", match.end(), end)
                if previous_space > match.end():
                    end = previous_space
            window = normalized[start:end].strip()
            if window:
                candidates.append((window, (-10_000 - value_index,)))

        accepted: List[Dict[str, Any]] = []
        seen: set[str] = set()
        covered_sentence_indexes: set[int] = set()
        for passage, sentence_indexes in candidates:
            if (
                passage in seen
                or (
                    len(sentence_indexes) > 1
                    and any(index in covered_sentence_indexes for index in sentence_indexes)
                )
                or not (16 <= len(passage) <= 1_200)
                or not material_value.search(passage)
            ):
                continue
            semantics = cls._direct_claim_semantics(
                passage,
                direct_document_text=normalized,
                retrieved_at=retrieved_at,
            )
            evidence_class = semantics.get("evidence_class")
            if (
                evidence_class == "official_statistic"
                and len(
                    extract_material_facts(
                        passage,
                        evidence_class="official_statistic",
                        temporal_scope=str(
                            semantics.get("observation_end") or "candidate"
                        ),
                        source_scope=["direct_document_candidate"],
                    )
                ) != 1
            ):
                # A claim-wide period/series cannot safely identify multiple
                # flattened values. Keep those cells out of verified evidence.
                continue
            temporally_proven = (
                evidence_class == "statutory_current"
                and semantics.get("current") is True
                and bool(semantics.get("effective_at"))
            ) or (
                evidence_class == "official_statistic"
                and semantics.get("latest_release") is True
                and bool(semantics.get("observation_end"))
            ) or (
                evidence_class == "observed_primary_market"
                and bool(semantics.get("observed_at"))
            )
            if semantics.get("critical") is not True or not temporally_proven:
                continue
            passage_values = {
                re.sub(r"\s+", "", match.group(0).casefold())
                for match in material_value.finditer(passage)
            }
            if any(
                row.get("evidence_class") == evidence_class
                and row.get("effective_at") == semantics.get("effective_at")
                and row.get("observation_end") == semantics.get("observation_end")
                and (
                    str(row.get("text") or "") in passage
                    or passage in str(row.get("text") or "")
                    or (
                        bool(
                            semantics.get("effective_at")
                            or semantics.get("observation_end")
                        )
                        and passage_values
                        == {
                            re.sub(r"\s+", "", match.group(0).casefold())
                            for match in material_value.finditer(
                                str(row.get("text") or "")
                            )
                        }
                    )
                )
                for row in accepted
            ):
                # Prefer the already accepted smaller exact sentence over a
                # later publication-marker window carrying the same fact.
                continue
            seen.add(passage)
            covered_sentence_indexes.update(sentence_indexes)
            accepted.append({"text": passage, **semantics})
            if len(accepted) >= maximum_passages:
                break
        return accepted

    @classmethod
    def _structured_offer_claim_passages(
        cls,
        text: str,
        proof: Dict[str, Any],
        *,
        retrieved_at: Optional[str],
        maximum_passages: int = 8,
        maximum_span: int = 480,
    ) -> List[Dict[str, Any]]:
        """Select bounded exact spans joining one signed offer identity and price.

        Product-detail pages often put the visible product heading and price in
        separate layout blocks. Sentence/value windows can therefore contain
        only one half. This selector never synthesizes text: it chooses the
        shortest contiguous substring of the signed normalized document whose
        visible identity and currency amount match one raw-derived, HMAC-bound
        Product/Offer. A span crossing another signed product identity is
        rejected so a neighbouring card cannot lend its price to this offer.
        """

        normalized = " ".join(str(text or "").split())
        offers = [
            row
            for row in proof.get("commercial_offer_evidence") or []
            if isinstance(row, dict)
        ]
        if not normalized or not offers:
            return []
        results: List[Dict[str, Any]] = []
        seen: set[str] = set()
        for offer in offers[:24]:
            binding = offer.get("visible_binding")
            if not isinstance(binding, dict):
                continue
            scope_text = " ".join(str(binding.get("scope_text") or "").split())
            if not scope_text or scope_text not in normalized:
                continue
            passage = " ".join(str(binding.get("claim_text") or "").split())
            if not (16 <= len(passage) <= maximum_span) or passage not in scope_text:
                continue
            matched = claim_matching_offer_evidence(
                {
                    "commercial_offer_evidence": [offer],
                    "country_codes": proof.get("country_codes") or [],
                },
                passage,
            )
            if not matched or matched.get("sha256") != offer.get("sha256"):
                continue
            if passage in seen:
                continue
            semantics = cls._direct_claim_semantics(
                passage,
                direct_document_text=normalized,
                retrieved_at=retrieved_at,
            )
            if (
                semantics.get("evidence_class") != "observed_primary_market"
                or semantics.get("critical") is not True
                or not semantics.get("observed_at")
            ):
                continue
            seen.add(passage)
            results.append({"text": passage, **semantics})
            if len(results) >= maximum_passages:
                break
        return results

    def _store_direct_web_evidence(
        self,
        source_rows: List[Dict[str, Any]],
        claim_rows: List[Dict[str, Any]],
    ) -> None:
        source_id_by_url = {}
        sources_by_id = {}
        for row in source_rows:
            url = str(row.get("url") or "")
            retrieval_url = str(row.get("retrieval_url") or url)
            provider = str(row.get("provider") or "")
            provider_source_id = str(row.get("provider_source_id") or "")
            # A source is the resolved document, not a provider-specific search
            # result. Provider IDs vary across queries (and across recovery),
            # which previously caused the URL deduper to alias a claim's
            # source_id while leaving the signed citation/artifact bound to the
            # discarded provider ID. Use the canonical direct URL so every
            # query route binds the same document to the same durable ID.
            source_id = self._evidence_id("source", url)
            source_id_by_url[url] = source_id
            source_id_by_url[retrieval_url] = source_id
            inferred_authority = self._source_authority(url, provider=provider)
            proof = row.get("authority_proof")
            # Authority enrichment is the only path that may promote a direct
            # non-.gov publisher to official_public. Preserve that signed
            # result; otherwise retain the conservative URL-derived label.
            authority = (
                str(row.get("source_authority"))
                if row.get("source_authority")
                in {"official_public", "first_party_catalog"}
                and isinstance(proof, dict)
                else inferred_authority
            )
            authority_document = row.get("authority_document_artifact")
            if isinstance(authority_document, dict):
                authority_document = {
                    **authority_document,
                    "source_id": source_id,
                }
            sources_by_id[source_id] = {
                "source_id": source_id,
                "source_type": "google_search_result",
                "url": url,
                "title": str(row.get("title") or url)[:500],
                "publisher": urlparse(url).hostname,
                "registry": None,
                "market_location": self.location,
                "source_authority": authority,
                "authority_verification_status": (
                    "provider_redirect_unverified"
                    if authority == "unverified_redirect"
                    else row.get("authority_verification_status")
                    or "direct_publisher_unclassified"
                ),
                "authority_proof": proof,
                "authority_document": (
                    {
                        key: value
                        for key, value in authority_document.items()
                        if key != "text"
                    }
                    if isinstance(authority_document, dict)
                    else None
                ),
                "_authority_document_artifact": authority_document,
                # Private trust anchor used only by AxWise quality validation.
                # It is SHA-bound in the authority proof and scrubbed by the
                # hybrid service immediately after the critical gate.
                "_structured_evidence_html": str(
                    row.get("_structured_evidence_html")
                    or ((row.get("_direct_document_candidate") or {}).get(
                        "_structured_evidence_html"
                    ) or "")
                )[:2_000_000],
                "provider": provider,
                "search_provider": provider,
                "provider_source_id": provider_source_id or None,
                "retrieved_at": row.get("retrieved_at"),
                "provider_response_hash": row.get("provider_response_hash"),
                "provider_query_ids": list(row.get("provider_query_ids") or []),
                "provider_queries": list(row.get("provider_queries") or []),
                "citation_metadata": row.get("citation_metadata") or {},
                "provider_redirect": authority == "unverified_redirect",
                "country_codes": list(row.get("country_codes") or []),
                "jurisdiction_binding_status": row.get(
                    "jurisdiction_binding_status"
                ),
            }

        # Build exact direct-document claims in addition to provider claims.
        # This is essential for Gemini/SearX results that summarize rather than
        # quote the underlying official page verbatim.
        direct_claim_rows: List[Dict[str, Any]] = []
        for source_id, source in sources_by_id.items():
            document = source.get("_authority_document_artifact")
            proof = source.get("authority_proof")
            if not isinstance(document, dict) or not isinstance(proof, dict):
                continue
            document_text = document.get("text")
            if not isinstance(document_text, str):
                continue
            for extracted in self._direct_document_claim_passages(
                document_text,
                retrieved_at=source.get("retrieved_at"),
            ):
                direct_claim_rows.append(
                    {
                        **extracted,
                        "source_urls": [source.get("url")],
                        "provider": "direct_authority_document",
                        "provider_source_id": source.get("provider_source_id"),
                        "provider_query_ids": list(
                            source.get("provider_query_ids") or []
                        ),
                        "provider_queries": list(source.get("provider_queries") or []),
                        "verification_status": "direct_authority_exact_quote",
                        "_source_id": source_id,
                    }
                )
            for extracted in self._structured_offer_claim_passages(
                document_text,
                proof,
                retrieved_at=source.get("retrieved_at"),
            ):
                matched_offer = claim_matching_offer_evidence(
                    proof, str(extracted.get("text") or "")
                )
                if matched_offer:
                    retained_rows: List[Dict[str, Any]] = []
                    for existing in direct_claim_rows:
                        existing_offer = (
                            claim_matching_offer_evidence(
                                proof, str(existing.get("text") or "")
                            )
                            if existing.get("_source_id") == source_id
                            and existing.get("evidence_class")
                            == "observed_primary_market"
                            else None
                        )
                        if (
                            existing_offer
                            and existing_offer.get("sha256")
                            == matched_offer.get("sha256")
                        ):
                            continue
                        retained_rows.append(existing)
                    # Prefer the explicit shortest identity-to-price span over
                    # a broad punctuation/value window for the same source and
                    # raw-derived signed offer. This keeps one assertion in the
                    # verified ledger without collapsing independent sources.
                    direct_claim_rows[:] = retained_rows
                direct_claim_rows.append(
                    {
                        **extracted,
                        "source_urls": [source.get("url")],
                        "provider": "direct_authority_document",
                        "provider_source_id": source.get("provider_source_id"),
                        "provider_query_ids": list(
                            source.get("provider_query_ids") or []
                        ),
                        "provider_queries": list(
                            source.get("provider_queries") or []
                        ),
                        "verification_status": (
                            "direct_authority_structured_offer_span"
                        ),
                        "_source_id": source_id,
                    }
                )
            structured_observations = list(
                proof.get("structured_statistical_observations") or []
            )
            # One exact atomic observation is enough to cover the class. Rank
            # commercially interpretable series ahead of generic index deltas
            # while preserving the publisher/parser order for ties.
            structured_observations.sort(
                key=lambda row: (
                    bool(
                        re.search(
                            r"\b(?:retail|sales|turnover|population|households?|"
                            r"employment|consumption|imports?|exports?)\b",
                            str((row or {}).get("series") or ""),
                            re.IGNORECASE,
                        )
                    ),
                    bool(
                        re.search(
                            r"\b(?:currency|euros?|dollars?|pounds?|million|billion)\b",
                            str((row or {}).get("unit") or ""),
                            re.IGNORECASE,
                        )
                    ),
                ),
                reverse=True,
            )
            if self.topic_seed_contract and self.market_scope.country_code:
                topic_matched: list[Dict[str, Any]] = []
                for observation in structured_observations:
                    topic_match = match_visible_statistical_topic(
                        self.topic_seed_contract,
                        {
                            "title": observation.get("table_title") or "",
                            "series": [observation.get("series") or ""],
                        },
                        country_code=str(self.market_scope.country_code),
                        expansion=self.topic_alias_expansion,
                        source_anchors=product_topic_phrases(
                            self.topic_seed_contract
                        ),
                    )
                    if topic_match.matched:
                        # The observation hash is part of the signed authority
                        # proof. Keep it byte-for-byte unchanged; topic_match is
                        # independently recomputed by the quality gate.
                        topic_matched.append(observation)
                    else:
                        self.routing_diagnostics[
                            "topic_mismatch_observation_count"
                        ] = min(
                            10_000,
                            int(
                                self.routing_diagnostics.get(
                                    "topic_mismatch_observation_count", 0
                                )
                            )
                            + 1,
                        )
                structured_observations = topic_matched
            for observation in structured_observations[:1]:
                if not isinstance(observation, dict):
                    continue
                canonical_claim_text = str(
                    observation.get("canonical_claim_text") or ""
                ).strip()
                row_text = canonical_claim_text or str(
                    observation.get("row_text") or ""
                ).strip()
                if not row_text or (
                    not canonical_claim_text
                    and document_text.find(row_text) < 0
                ):
                    continue
                direct_claim_rows.append(
                    {
                        "text": row_text,
                        "critical": True,
                        "evidence_class": "official_statistic",
                        "observation_end": observation.get("observation_end"),
                        "published_at": observation.get("published_at"),
                        "latest_release": True,
                        "latest_release_basis": "signed_structured_table_latest_period",
                        "structured_statistical_observation": observation,
                        "source_urls": [source.get("url")],
                        "provider": "direct_authority_document",
                        "provider_source_id": source.get("provider_source_id"),
                        "verification_status": "direct_authority_structured_table_row",
                        "_source_id": source_id,
                    }
                )

        linked_source_ids = set()
        stored_identities: set[str] = set()
        # Signed raw-derived rows win an identical text/source identity over a
        # search-provider paraphrase. The latter must never consume the dedupe
        # slot and suppress a verifiable structured claim.
        for row in [*direct_claim_rows, *claim_rows]:
            if not isinstance(row, dict):
                continue
            text = str(row.get("text") or "").strip()[:2000]
            source_ids = [
                source_id_by_url[url]
                for url in row.get("source_urls") or []
                if url in source_id_by_url
            ]
            requested_country = str(
                self.market_scope.country_code or ""
            ).upper()
            signed_direct_market_binding = (
                row.get("provider") == "direct_authority_document"
                and any(
                    (sources_by_id.get(source_id) or {}).get(
                        "jurisdiction_binding_status"
                    )
                    == "verified"
                    and isinstance(
                        (sources_by_id.get(source_id) or {}).get(
                            "authority_proof"
                        ),
                        dict,
                    )
                    and (
                        not requested_country
                        or requested_country
                        in {
                            str(code).upper()
                            for code in (
                                (sources_by_id.get(source_id) or {}).get(
                                    "country_codes"
                                )
                                or []
                            )
                        }
                    )
                    for source_id in source_ids
                )
            )
            if (
                text
                and not self.market_scope.evidence_text_matches(text)
                and not signed_direct_market_binding
            ):
                self.routing_diagnostics["rejected_cross_market_claims"].append(
                    {
                        "text_hash": self._evidence_id("claim", text),
                    }
                )
                continue
            if not text or not source_ids:
                continue
            linked_source_ids.update(source_ids)
            identity = f"{text}|{'|'.join(sorted(set(source_ids)))}"
            if identity in stored_identities:
                continue
            citation_metadata = {
                "segment_start": row.get("segment_start"),
                "segment_end": row.get("segment_end"),
                "grounding_chunk_indices": list(
                    row.get("grounding_chunk_indices") or []
                ),
                "span_target": row.get("span_target"),
                "part_index": row.get("part_index"),
                "offset_unit": row.get("offset_unit"),
            }
            provenance_artifact = row.get("provenance_artifact")
            provider_retrieval_provenance = {
                "citation_metadata": citation_metadata,
                "provenance_artifact": provenance_artifact,
                "provider_response_hash": row.get("provider_response_hash"),
            }
            semantic_metadata: Dict[str, Any] = {}
            bound_to_direct_document = False
            # A search snippet/provider answer may discover a fact, but it
            # cannot verify an official critical fact. Re-bind only when the
            # exact claim occurs in the independently fetched, signed direct
            # authority document.
            for source_id in source_ids:
                source = sources_by_id.get(source_id) or {}
                document = source.get("_authority_document_artifact")
                proof = source.get("authority_proof") or {}
                if not isinstance(document, dict) or not isinstance(proof, dict):
                    continue
                document_text = document.get("text")
                if not isinstance(document_text, str):
                    continue
                structured_observation = row.get(
                    "structured_statistical_observation"
                )
                if (
                    isinstance(structured_observation, dict)
                    and structured_observation.get("canonical_claim_text")
                    == text
                ):
                    try:
                        bound_artifact = (
                            build_structured_statistical_claim_artifact(
                                source_id=source_id,
                                source_url=str(source.get("url") or ""),
                                authority_proof=proof,
                                authority_document=document,
                                observation=structured_observation,
                            )
                        )
                    except ValueError:
                        continue
                    citation_metadata = {
                        "segment_start": 0,
                        "segment_end": len(text),
                        "span_target": (
                            "derived_structured_statistical_observation"
                        ),
                        "offset_unit": "unicode_codepoints",
                        "source_id": source_id,
                    }
                    provenance_artifact = bound_artifact
                    semantic_metadata = {
                        "critical": True,
                        "evidence_class": "official_statistic",
                        "observation_end": structured_observation.get(
                            "observation_end"
                        ),
                        "published_at": structured_observation.get(
                            "published_at"
                        ),
                        "latest_release": True,
                        "latest_release_basis": (
                            "signed_structured_table_latest_period"
                        ),
                        "structured_statistical_observation": (
                            structured_observation
                        ),
                        "semantic_extraction": (
                            "signed_structured_statistical_display_v1"
                        ),
                    }
                    provider_retrieval_provenance = {
                        "provider_response_hash": row.get(
                            "provider_response_hash"
                        ),
                        "provider_query_ids": list(
                            row.get("provider_query_ids") or []
                        ),
                        "citation_metadata": (
                            provider_retrieval_provenance[
                                "citation_metadata"
                            ]
                        ),
                    }
                    bound_to_direct_document = True
                    break
                if document_text.find(text) < 0:
                    continue
                try:
                    bound_artifact = build_authority_claim_artifact(
                        source_id=source_id,
                        source_url=str(source.get("url") or ""),
                        authority_proof=proof,
                        authority_document=document,
                        claim_text=text,
                    )
                except ValueError:
                    continue
                binding = bound_artifact["claim_binding"]
                citation_metadata = {
                    "segment_start": binding["claim_start"],
                    "segment_end": binding["claim_end"],
                    "span_target": "direct_authority_document",
                    "offset_unit": "unicode_codepoints",
                    "source_id": source_id,
                }
                provenance_artifact = bound_artifact
                semantic_metadata = self._direct_claim_semantics(
                    text,
                    direct_document_text=document_text,
                    retrieved_at=source.get("retrieved_at"),
                )
                if isinstance(row.get("structured_statistical_observation"), dict):
                    observation = row["structured_statistical_observation"]
                    semantic_metadata = {
                        "critical": True,
                        "evidence_class": "official_statistic",
                        "observation_end": observation.get("observation_end"),
                        "published_at": observation.get("published_at"),
                        "latest_release": True,
                        "latest_release_basis": "signed_structured_table_latest_period",
                        "structured_statistical_observation": observation,
                        "semantic_extraction": "signed_structured_statistical_table_v1",
                    }
                elif semantic_metadata.get("evidence_class") == "observed_primary_market":
                    matched_offer = claim_matching_offer_evidence(proof, text)
                    if matched_offer:
                        semantic_metadata["structured_commercial_offer"] = matched_offer
                        semantic_metadata["semantic_extraction"] = (
                            "signed_structured_product_offer_v1"
                        )
                    else:
                        # A currency value on a signed page is not itself proof
                        # of a first-party offer (cart totals, tax thresholds,
                        # encyclopaedia prose). Retain it as noncritical data.
                        semantic_metadata = {
                            "critical": False,
                            "evidence_class": "source_linked_observation",
                            "semantic_extraction": "price_not_bound_to_signed_offer_v1",
                        }
                provider_retrieval_provenance = {
                    "provider_response_hash": row.get("provider_response_hash"),
                    "provider_query_ids": list(row.get("provider_query_ids") or []),
                    "citation_metadata": provider_retrieval_provenance[
                        "citation_metadata"
                    ],
                }
                bound_to_direct_document = True
                break
            if not bound_to_direct_document and any(
                isinstance((sources_by_id.get(source_id) or {}).get(
                    "_authority_document_artifact"
                ), dict)
                for source_id in source_ids
            ):
                # Retain the provider observation for transparency, while
                # explicitly preventing a paraphrase from becoming a verified
                # critical fact. The separately extracted exact passage is the
                # only claim eligible for authoritative validation.
                semantic_metadata = {
                    "critical": False,
                    "evidence_class": "source_linked_observation",
                    "semantic_extraction": "provider_paraphrase_not_exact_quote_v1",
                }
            stored_identities.add(identity)
            self.market_claims.append(
                {
                    "claim_id": self._evidence_id("claim", identity),
                    "claim_type": "grounded_web_evidence",
                    "subject": self.location,
                    "predicate": "has_market_evidence",
                    "object": text,
                    "source_ids": list(dict.fromkeys(source_ids)),
                    "verification_status": row.get("verification_status")
                    or "provider_citation_linked_not_independently_verified",
                    "confidence_scores": list(row.get("confidence_scores") or [])[:10],
                    "evidence_class": row.get("evidence_class"),
                    "provider": row.get("provider"),
                    "provider_response_hash": row.get("provider_response_hash"),
                    "provider_query_ids": list(row.get("provider_query_ids") or []),
                    "provider_queries": list(row.get("provider_queries") or []),
                    "citation_metadata": citation_metadata,
                    "provenance_artifact": provenance_artifact,
                    "provider_retrieval_provenance": provider_retrieval_provenance,
                    "country_codes": [self.market_scope.country_code]
                    if self.market_scope.country_code
                    else [],
                    **semantic_metadata,
                }
            )
        # Retain the capped, internal direct-document artifact until the
        # critical gate has independently re-derived structured table cells.
        # The hybrid service strips this private key immediately after the
        # gate, before any result, bundle, callback, or failure persistence.
        self.market_sources.extend(
            dict(row)
            for source_id, row in sources_by_id.items()
            if source_id in linked_source_ids
        )

    def _accept_market_companies(
        self, companies: List[CompanyDiscoveryItem], *, provider: str
    ) -> List[CompanyDiscoveryItem]:
        accepted = []
        for company in companies:
            if self.market_scope.company_matches(company):
                accepted.append(company)
                continue
            self.routing_diagnostics["rejected_cross_market"].append(
                {
                    "provider": provider,
                    "company_id": str(company.id)[:255],
                    "location": str(company.location)[:500],
                }
            )
        return accepted

    @staticmethod
    def _deduplicate_companies(
        companies: List[CompanyDiscoveryItem],
    ) -> List[CompanyDiscoveryItem]:
        rows: Dict[str, CompanyDiscoveryItem] = {}
        for company in companies:
            identity = str(company.register_number or company.website or company.name)
            key = re.sub(r"[^a-z0-9]+", "", identity.casefold())
            existing = rows.get(key)
            if not existing:
                rows[key] = company
                continue
            existing.pain_point_sources = list(
                dict.fromkeys(
                    (existing.pain_point_sources or [])
                    + (company.pain_point_sources or [])
                )
            )
            for field in ("website", "contact_phone", "email", "register_number"):
                if not getattr(existing, field, None) and getattr(company, field, None):
                    setattr(existing, field, getattr(company, field))
        return list(rows.values())

    async def _fetch_from_openregister(self) -> List[CompanyDiscoveryItem]:
        """Queries OpenRegister API with geo-radius search and enriches with real contact/person data."""
        registry_location = self.market_scope.openregister_locality
        if not registry_location:
            logger.info("Skipping OpenRegister: unsupported market %s", self.location)
            return []
        logger.info("Querying OpenRegister for companies in %s...", registry_location)
        
        try:
            from openregister import Openregister
            client = Openregister(api_key=self.openregister_key)
            
            # 1. Determine search strategy: geo-radius or city filter
            coords = self._get_city_coordinates()
            
            # Derive German keyword for the industry
            german_city, search_keyword = await self._derive_search_params()
            
            search_params: Dict[str, Any] = {
                "pagination": {"page": 1, "per_page": 20}
            }
            
            # Prefer geo-radius search if we have coordinates
            if coords:
                search_params["location"] = {
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "radius": 25.0  # 25 km radius
                }
                logger.info(f"Using geo-radius search: {coords[0]:.4f}, {coords[1]:.4f}, radius=25km")
            else:
                # Fallback to city text filter
                search_params["filters"] = [
                    {"field": "city", "value": german_city},
                    {"field": "active", "value": "true"}
                ]
                logger.info(f"Using city filter: {german_city}")
            
            if search_keyword:
                search_params["query"] = {"value": search_keyword}
            
            search_response = client.search.find_companies_v1(**search_params)
            
            # Retry without keyword if no results
            if not search_response.results and search_keyword:
                logger.info("Keyword search returned no results. Retrying without keyword filter.")
                search_params.pop("query", None)
                search_response = client.search.find_companies_v1(**search_params)

            if not search_response.results:
                logger.warning(f"No companies found in OpenRegister for {self.location}.")
                return []

            logger.info(f"OpenRegister found {len(search_response.results)} companies. Enriching top 15...")
            
            # 2. Enrich top 15 results with full details
            companies = []
            for item in search_response.results[:15]:
                try:
                    company = await self._enrich_openregister_company(client, item)
                    if company:
                        companies.append(company)
                except Exception as details_err:
                    logger.error(f"Error enriching company {item.company_id}: {details_err}")
            
            # 3. Geocode addresses in bulk
            if companies:
                await self._geocode_companies(companies)
            
            return companies

        except Exception as e:
            logger.error(f"Error in OpenRegister fetch pipeline: {e}", exc_info=True)
            return []

    async def _derive_search_params(self) -> tuple:
        """Derive only a keyword; geography remains deterministic and authorized."""
        german_city = self.market_scope.openregister_locality
        if not german_city:
            return "", ""
        search_keyword = ""
        
        if not self.model:
            return german_city, search_keyword

        try:
            class OpenRegisterQueryParams(BaseModel):
                search_keyword: str

            agent = Agent(
                model=self.model,
                output_type=NativeOutput(OpenRegisterQueryParams),
                system_prompt=f"""You are a German B2B market intelligence assistant.
Analyze the business problem: '{self.business_problem}'
Analyze the target user: '{self.target_user}'

Determine:
1. A single highly relevant German keyword for company registry search (e.g., 'Logistik', 'Spedition', 'Software', 'Maschinenbau', 'Handel', 'Pflege').

The registry locality is fixed by the authorized request and is not yours to infer or change.
"""
            )
            
            params_result = await agent.run("Extract parameters for OpenRegister search.")
            params = params_result.output
            search_keyword = params.search_keyword
        except Exception as param_err:
            logger.error(f"Failed to extract search params via LLM: {param_err}")

        logger.info(f"Search params: City={german_city}, Keyword={search_keyword}")
        return german_city, search_keyword

    async def _enrich_openregister_company(self, client, item) -> Optional[CompanyDiscoveryItem]:
        """Fetch full details, contacts, and owners for a single OpenRegister company."""
        details = client.company.get_details_v1(company_id=item.company_id)
        
        # Skip inactive companies
        if details.status != "active":
            return None
        
        # --- Name ---
        name = details.name.name if details.name else item.name or "Unknown Company"
        
        # --- Legal Form ---
        legal_form_str = details.legal_form.upper() if details.legal_form else None
        
        # --- Purpose (registered business activity) ---
        purpose_text = None
        if details.purpose and details.purpose.purpose:
            purpose_text = details.purpose.purpose
        
        # --- Industry from WZ codes or purpose ---
        industry_str = "Services"
        if details.industry_codes and details.industry_codes.wz2025:
            # Use the first WZ2025 code description
            wz_codes = details.industry_codes.wz2025
            if wz_codes:
                code_obj = wz_codes[0]
                # WZ codes have code and description attributes
                desc = getattr(code_obj, 'description', None) or getattr(code_obj, 'label', None)
                code = getattr(code_obj, 'code', None)
                if desc:
                    industry_str = desc
                elif code:
                    industry_str = f"WZ2025: {code}"
        if industry_str == "Services" and purpose_text:
            industry_str = purpose_text[:120] + "..." if len(purpose_text) > 120 else purpose_text
        
        # --- Size from indicators ---
        employees = None
        if details.indicators:
            sorted_indicators = sorted(
                details.indicators, 
                key=lambda x: getattr(x, 'date', ''), 
                reverse=True
            )
            for ind in sorted_indicators:
                if getattr(ind, 'employees', None) is not None:
                    employees = ind.employees
                    break
        size_str = f"{employees} employees" if employees else "10-50 employees (estimated)"

        # --- Address ---
        address_str = details.address.formatted_value if details.address else f"{self.location}, Germany"
        
        # --- Register info ---
        register_court = None
        register_number = None
        if details.company_register:
            register_court = getattr(details.company_register, 'court', None) or item.register_court
            register_number = f"{item.register_type} {item.register_number}" if hasattr(item, 'register_type') else item.register_number
        
        # --- Decision makers from representation (real people from Handelsregister) ---
        decision_makers = []
        decision_maker_details = []
        if details.representation:
            for rep in details.representation:
                # Skip ended roles
                if rep.end_date:
                    continue
                    
                role_label = rep.role if isinstance(rep.role, str) else str(rep.role)
                role_display = {
                    "DIRECTOR": "Geschäftsführer",
                    "PROKURA": "Prokurist",
                    "OWNER": "Inhaber",
                    "PARTNER": "Gesellschafter",
                    "PERSONAL_LIABLE_DIRECTOR": "Pers. haftender Gesellschafter",
                    "LIQUIDATOR": "Liquidator",
                    "SHAREHOLDER": "Gesellschafter",
                }.get(role_label, role_label)
                
                dm_detail: Dict[str, str] = {"role": role_display}
                
                if rep.natural_person:
                    first = rep.natural_person.first_name or ""
                    last = rep.natural_person.last_name or ""
                    full_name = f"{first} {last}".strip()
                    dm_detail["name"] = full_name
                    dm_detail["type"] = "natural_person"
                    if rep.natural_person.city:
                        dm_detail["city"] = rep.natural_person.city
                    if rep.start_date:
                        # openregister-sdk may deserialize ISO dates as
                        # datetime.date objects.  The public discovery model
                        # deliberately exposes JSON-safe strings, so normalize
                        # at the adapter boundary instead of rejecting an
                        # otherwise valid company record.
                        dm_detail["since"] = (
                            rep.start_date.isoformat()
                            if hasattr(rep.start_date, "isoformat")
                            else str(rep.start_date)
                        )
                    decision_makers.append(f"{role_display}: {full_name}")
                elif rep.legal_person:
                    lp_name = getattr(rep.legal_person, 'name', None) or rep.name
                    dm_detail["name"] = lp_name
                    dm_detail["type"] = "legal_person"
                    decision_makers.append(f"{role_display}: {lp_name}")
                else:
                    decision_makers.append(f"{role_display}: {rep.name}")
                    dm_detail["name"] = rep.name
                
                decision_maker_details.append(dm_detail)
        
        if not decision_makers:
            decision_makers = [f"Managing Director ({name})"]
        
        # --- Contact info (website, email, phone, social media) ---
        website = None
        contact_phone = None
        email = None
        linkedin_url = None
        xing_url = None
        
        # Try from details.contact first
        if details.contact:
            website = details.contact.website_url or None
            contact_phone = details.contact.phone or None
            email = details.contact.email or None
            
            if details.contact.social_media:
                linkedin_url = details.contact.social_media.linkedin or None
                xing_url = details.contact.social_media.xing or None
        
        # Fallback to get_contact_v0 for additional data
        if not website or not contact_phone:
            try:
                contact_data = client.company.get_contact_v0(company_id=item.company_id)
                if not website and contact_data.source_url:
                    website = contact_data.source_url
                if not contact_phone and contact_data.phone:
                    contact_phone = contact_data.phone
                if not email and contact_data.email:
                    email = contact_data.email
            except Exception as contact_err:
                logger.debug(f"get_contact_v0 failed for {item.company_id}: {contact_err}")
        
        # Build insights showing provenance
        registry_info = f"{item.register_type} {item.register_number}, {item.register_court}" if hasattr(item, 'register_type') else item.company_id
        insights = f"Verified via Handelsregister ({registry_info}). Status: active."
        if purpose_text:
            insights += f" Registered purpose: {purpose_text[:200]}"

        return CompanyDiscoveryItem(
            id=item.company_id,
            name=name,
            industry=industry_str,
            size=size_str,
            location=address_str,
            latitude=0.0,  # geocoded in bulk later
            longitude=0.0,
            decision_makers=decision_makers,
            estimated_pain_points=[],  # enriched later with grounded evidence
            insights=insights,
            website=website,
            contact_phone=contact_phone,
            linkedin_url=linkedin_url,
            xing_url=xing_url,
            email=email,
            register_court=register_court or item.register_court,
            register_number=f"{item.register_type} {item.register_number}" if hasattr(item, 'register_type') else None,
            legal_form=legal_form_str,
            purpose=purpose_text,
            decision_maker_details=decision_maker_details if decision_maker_details else None,
        )

    async def _geocode_companies(self, companies: List[CompanyDiscoveryItem]):
        """Geocode company addresses in bulk using LLM or fallback coordinates."""
        if not self.model:
            coords = self._get_city_coordinates()
            if not coords:
                logger.warning(
                    "No deterministic coordinates for authorized market %s; preserving unknown coordinates.",
                    self.location,
                )
                return
            base_lat, base_lon = coords
            import random
            for c in companies:
                c.latitude = base_lat + random.uniform(-0.04, 0.04)
                c.longitude = base_lon + random.uniform(-0.04, 0.04)
            return

        try:
            class GeocodeCoordinates(BaseModel):
                latitude: float
                longitude: float

            class GeocodeResults(BaseModel):
                coordinates: List[GeocodeCoordinates]

            geocode_agent = Agent(
                model=self.model,
                output_type=NativeOutput(GeocodeResults),
                system_prompt=f"""You are a geocoding helper.
Given a list of company addresses in or around '{self.location}', estimate realistic latitude and longitude coordinates for each.
They must be physically located in the explicitly authorized market '{self.location}'.
Spread them out realistically across the city area — don't cluster them all at the exact center.
Return exactly one coordinate pair per address, in the same order as the input list.
"""
            )
            
            addresses_list = [f"{c.name}: {c.location}" for c in companies]
            prompt = f"Geocode these {len(addresses_list)} company addresses:\n" + "\n".join(f"{i+1}. {a}" for i, a in enumerate(addresses_list))
            geo_result = await geocode_agent.run(prompt)
            
            for idx, coord in enumerate(geo_result.output.coordinates):
                if idx < len(companies):
                    companies[idx].latitude = coord.latitude
                    companies[idx].longitude = coord.longitude
        except Exception as geo_err:
            logger.error(f"Failed to geocode company addresses: {geo_err}", exc_info=True)
            coords = self._get_city_coordinates()
            if not coords:
                return
            base_lat, base_lon = coords
            import random
            for c in companies:
                if c.latitude == 0.0:
                    c.latitude = base_lat + random.uniform(-0.04, 0.04)
                    c.longitude = base_lon + random.uniform(-0.04, 0.04)

    async def _discover_via_web_search(self) -> List[CompanyDiscoveryItem]:
        """Discover real market entities using bounded, source-bearing web routes."""
        if not self.model:
            return []

        eurostat_applicable = bool(
            "official_statistic" in self.required_evidence_classes
            and self.topic_seed_contract
            and self.market_scope.country_code
        )
        eurostat_task: Optional[asyncio.Task[Any]] = None
        if eurostat_applicable:
            # Start the deterministic official-data route before provider
            # setup/fanout. It is independent of Gemini/SearX availability and
            # runs concurrently with all generic retrieval calls.
            eurostat_task = asyncio.create_task(
                acquire_eurostat_comext_source(
                    self.topic_seed_contract,
                    country_code=str(self.market_scope.country_code),
                    stage_seconds=_EUROSTAT_COMEXT_STAGE_DEADLINE_SECONDS,
                )
            )

        search_services = []
        try:
            from backend.services.generative.gemini_search_service import GeminiSearchService
        except ImportError:
            logger.warning("GeminiSearchService not available.")
        else:
            gemini_search = GeminiSearchService()
            if gemini_search.is_available():
                search_services.append(("gemini_google_search", gemini_search))
        try:
            from backend.services.generative.searxng_search_service import (
                SearxngSearchService,
            )

            searxng = SearxngSearchService()
            if searxng.is_available():
                search_services.append(("searxng", searxng))
        except ImportError:
            pass

        if not search_services:
            logger.warning("No grounded web search provider is available.")
            if eurostat_task is None:
                return []

        generic_query = (
            f"Research the market explicitly and only for: '{self.location}'. "
            f"Do not substitute another city, country, or region. Find current, verifiable "
            f"evidence relevant to: '{self.business_problem}' and target stakeholder "
            f"'{self.target_user}'. Prefer national or supranational regulators, official "
            f"statistics, official company registries, official company websites, and "
            f"recognized industry bodies. Identify real organizations operating in the "
            f"authorized market and include an explicit headquarters or operating location."
        )

        directed_queries = self._directed_evidence_queries()
        query_contracts = (
            [*directed_queries, self._authority_attestation_query()]
            if directed_queries
            else [{"evidence_class": "general_market", "query": generic_query}]
        )
        self.routing_diagnostics["directed_queries"] = [
            {
                "evidence_class": row["evidence_class"],
                "query_id": self._evidence_id("query", row["query"]),
            }
            for row in directed_queries
        ]

        provider_claim_lineage_rows: List[tuple[str, frozenset[str]]] = []
        provider_lineage_sequence = 0
        source_rows = []
        claim_rows = []
        seen_urls = set()
        async def run_provider(
            provider: str,
            search_service: Any,
            query_contract: Dict[str, str],
        ) -> tuple[str, str, Dict[str, Any] | BaseException]:
            try:
                # Both provider SDKs expose synchronous search methods. Run them
                # off the event loop so independent market cells can genuinely
                # progress concurrently instead of serializing on network I/O.
                return (
                    provider,
                    query_contract["evidence_class"],
                    await asyncio.to_thread(
                        search_service.search_web_general,
                        query_contract["query"],
                    ),
                )
            except Exception as exc:
                return provider, query_contract["evidence_class"], exc

        try:
            provider_results = await asyncio.gather(
                *(
                    run_provider(provider, service, query_contract)
                    for provider, service in search_services
                    for query_contract in query_contracts
                )
            )
        except asyncio.CancelledError:
            if eurostat_task is not None and not eurostat_task.done():
                eurostat_task.cancel()
                await asyncio.gather(eurostat_task, return_exceptions=True)
            raise

        eurostat_result = None
        if eurostat_task is not None:
            try:
                eurostat_result = await eurostat_task
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "Eurostat Comext acquisition failed with %s.",
                    type(exc).__name__,
                )
                self._record_provider(
                    "eurostat_comext",
                    attempted=True,
                    accepted=0,
                    source_count=0,
                    reason=f"adapter_error:{type(exc).__name__}",
                    details={
                        "evidence_class": "official_statistic",
                        "status": "failed_closed",
                        "deadline_ms": int(
                            _EUROSTAT_COMEXT_STAGE_DEADLINE_SECONDS * 1_000
                        ),
                    },
                )

        if eurostat_result is not None:
            raw_diagnostics = (
                eurostat_result.diagnostics
                if isinstance(eurostat_result.diagnostics, dict)
                else {}
            )
            safe_diagnostics = {
                key: raw_diagnostics.get(key)
                for key in (
                    "status",
                    "reason",
                    "call_count",
                    "metadata_call_count",
                    "data_call_count",
                    "elapsed_ms",
                    "deadline_ms",
                    "reporter_code",
                    "product_code",
                    "selected_period",
                )
                if raw_diagnostics.get(key) is not None
            }
            completed_source = (
                eurostat_result.source
                if eurostat_result.status == "completed"
                and isinstance(eurostat_result.source, dict)
                else None
            )
            if completed_source is not None:
                source_rows.append(completed_source)
                source_url = str(completed_source.get("url") or "")
                if source_url:
                    seen_urls.add(source_url)
            self.routing_diagnostics["eurostat_comext"] = safe_diagnostics
            self._record_provider(
                "eurostat_comext",
                attempted=True,
                accepted=0,
                source_count=1 if completed_source is not None else 0,
                reason=(
                    None
                    if completed_source is not None
                    else str(eurostat_result.status or "failed_closed")[:80]
                ),
                details={
                    "evidence_class": "official_statistic",
                    **safe_diagnostics,
                },
            )

        for provider, evidence_class, search_result in provider_results:
            if isinstance(search_result, BaseException):
                exc = search_result
                logger.warning(
                    "Grounded search provider %s failed with %s.",
                    f"{provider}:{evidence_class}",
                    type(exc).__name__,
                )
                self._record_provider(
                    f"{provider}:{evidence_class}",
                    attempted=True,
                    accepted=0,
                    source_count=0,
                    reason=f"provider_error:{type(exc).__name__}",
                )
                continue
            provider_claims = [
                row
                for row in search_result.get("claims") or []
                if isinstance(row, dict)
            ]
            provider_sources = self._rank_provider_sources_for_topic(
                evidence_class,
                [row for row in search_result.get("sources") or [] if isinstance(row, dict)],
                provider_claims,
            )
            performed = bool(search_result.get("search_performed"))
            for claim in provider_claims:
                claim_rows.append(
                    {
                        **claim,
                        "acquisition_evidence_class": evidence_class,
                    }
                )
            accepted_current_urls: set[str] = set()
            accepted_lineage_by_url: Dict[str, str] = {}
            candidate_cap = (
                _MAX_OBSERVED_CANDIDATES_PER_QUERY_PROVIDER
                if evidence_class == "observed_primary_market"
                else _MAX_SOURCES_PER_QUERY_PROVIDER
            )
            valid_sources_by_identity: Dict[str, tuple[str, Dict[str, Any]]] = {}
            # The scan bound applies to distinct retrieval identities. URL
            # fragments never reach the server and therefore cannot crowd a
            # later product detail out of the recovery window.
            for source in provider_sources[: candidate_cap * 8]:
                if not isinstance(source, dict):
                    continue
                url = str(source.get("url") or "").strip()
                if not url:
                    continue
                try:
                    parsed_url = urlparse(url)
                except ValueError:
                    parsed_url = None
                if (
                    not parsed_url
                    or parsed_url.scheme.casefold() != "https"
                    or not parsed_url.hostname
                    or parsed_url.username
                    or parsed_url.password
                ):
                    self.routing_diagnostics["rejected_invalid_sources"].append(
                        {"provider": provider, "url": url[:2048]}
                    )
                    continue
                if not self.market_scope.source_url_matches(url):
                    self.routing_diagnostics[
                        "rejected_cross_market_sources"
                    ].append(
                        {
                            "provider": provider,
                            "url": url[:2048],
                        }
                    )
                    continue
                identity = _authority_retrieval_identity(url)
                valid_sources_by_identity.setdefault(identity, (url, source))
                if len(valid_sources_by_identity) >= candidate_cap * 2:
                    break
            valid_sources_by_url = {
                url: source for url, source in valid_sources_by_identity.values()
            }
            admitted_urls = _admit_provider_candidate_urls(
                list(valid_sources_by_url),
                existing_urls={str(row.get("url") or "") for row in source_rows},
                new_url_cap=candidate_cap,
            )
            for url in admitted_urls:
                source = valid_sources_by_url[url]
                retrieval_identity = _authority_retrieval_identity(url)
                existing = next(
                    (
                        row
                        for row in source_rows
                        if _authority_retrieval_identity(
                            str(row.get("url") or "")
                        )
                        == retrieval_identity
                    ),
                    None,
                )
                source_payload = {
                    "title": str(source.get("title") or "Unknown")[:500],
                    "url": url,
                    "provider": provider,
                    "provider_source_id": source.get("provider_source_id"),
                    "retrieved_at": source.get("retrieved_at"),
                    "provider_response_hash": source.get("provider_response_hash"),
                    "provider_query_ids": source.get("provider_query_ids") or [],
                    "provider_queries": source.get("provider_queries") or [],
                    "citation_metadata": source.get("citation_metadata") or {},
                    "provider_redirect": bool(source.get("provider_redirect")),
                    "country_codes": [self.market_scope.country_code]
                    if self.market_scope.country_code
                    else [],
                    "market_terms": list(
                        dict.fromkeys(
                            value
                            for value in (
                                self.location,
                                self.market_scope.locality,
                                self.market_scope.country_name,
                            )
                            if value
                        )
                    ),
                    "acquisition_evidence_classes": [evidence_class],
                }
                provider_lineage_sequence += 1
                lineage_token = f"provider-source-{provider_lineage_sequence}"
                source_payload["_provider_lineage_tokens"] = (lineage_token,)
                accepted_lineage_by_url[url] = lineage_token
                accepted_lineage_by_url[url.rstrip("/")] = lineage_token
                if existing:
                    for key in ("provider_query_ids", "provider_queries"):
                        existing[key] = list(
                            dict.fromkeys(
                                list(existing.get(key) or [])
                                + list(source_payload.get(key) or [])
                            )
                        )
                    existing["acquisition_evidence_classes"] = list(
                        dict.fromkeys(
                            list(existing.get("acquisition_evidence_classes") or [])
                            + [evidence_class]
                        )
                    )
                    existing["_provider_lineage_tokens"] = tuple(
                        dict.fromkeys(
                            tuple(existing.get("_provider_lineage_tokens") or ())
                            + (lineage_token,)
                        )
                    )
                    continue
                accepted_current_urls.add(url)
                seen_urls.add(url)
                source_rows.append(source_payload)

            if performed and accepted_lineage_by_url:
                for claim in provider_claims:
                    claim_text = str(
                        claim.get("text") or claim.get("object") or ""
                    ).strip()[:2000]
                    lineage_tokens = frozenset(
                        token
                        for linked_url in claim.get("source_urls") or []
                        if (
                            token := accepted_lineage_by_url.get(
                                str(linked_url)
                            )
                            or accepted_lineage_by_url.get(
                                str(linked_url).rstrip("/")
                            )
                        )
                    )
                    if claim_text and lineage_tokens:
                        provider_claim_lineage_rows.append(
                            (claim_text, lineage_tokens)
                        )

            runtime = search_result.get("runtime_diagnostics") or {}
            self._record_provider(
                f"{provider}:{evidence_class}",
                attempted=True,
                accepted=0,
                source_count=len(accepted_current_urls),
                reason=None if performed else "empty_or_failed",
                details={
                    "evidence_class": evidence_class,
                    "query_id": self._evidence_id(
                        "query",
                        next(
                            row["query"]
                            for row in query_contracts
                            if row["evidence_class"] == evidence_class
                        ),
                    ),
                    "result_source_count": len(provider_sources),
                    "runtime": {
                        key: runtime.get(key)
                        for key in (
                            "route",
                            "model",
                            "status",
                            "elapsed_ms",
                            "call_count",
                            "retry_count",
                            "deadline_ms",
                            "fallback_used",
                            "http_status",
                            "result_count",
                            "unresponsive_engines",
                        )
                        if runtime.get(key) is not None
                    },
                    "provider_error": search_result.get("error"),
                },
            )

            # Use a configured secondary route only when the earlier provider
            # cannot meet the minimum deep-research source diversity.
            linked_urls = {
                str(url)
                for claim in claim_rows
                if isinstance(claim, dict)
                and self.market_scope.evidence_text_matches(claim.get("text"))
                for url in claim.get("source_urls") or []
                if url in seen_urls
            }
            # Both routes always complete: independent corroboration is a
            # quality property, not merely a fallback for an empty first call.

        # Direct publisher verification is independent of retrieval/synthesis.
        # A non-.gov authority can become official only after its fetched page
        # is linked from a separately fetched government/EU root. Work on a
        # private snapshot so a pathological cancellation cannot mutate the
        # evidence rows after the hard stage deadline has returned.
        authority_started = time.monotonic()
        scheduled_authority_rows = _schedule_authority_candidates(source_rows)
        authority_candidate_count = len(scheduled_authority_rows)
        def clone_authority_row(row: Dict[str, Any]) -> Dict[str, Any]:
            return {
                **row,
                "provider_query_ids": list(row.get("provider_query_ids") or []),
                "provider_queries": list(row.get("provider_queries") or []),
                "citation_metadata": dict(row.get("citation_metadata") or {}),
                "country_codes": list(row.get("country_codes") or []),
                "market_terms": list(row.get("market_terms") or []),
                "acquisition_evidence_classes": list(
                    row.get("acquisition_evidence_classes") or []
                ),
            }

        authority_working_rows = [
            clone_authority_row(row) for row in scheduled_authority_rows
        ]
        logger.info(
            "Direct authority resolution started; candidates=%s deadline_ms=%s",
            authority_candidate_count,
            int(_AUTHORITY_STAGE_DEADLINE_SECONDS * 1000),
        )
        authority_status = "completed"
        try:
            enriched_rows = await _await_with_hard_stage_deadline(
                enrich_authority_sources(authority_working_rows),
                deadline_seconds=_AUTHORITY_STAGE_DEADLINE_SECONDS,
            )
            source_rows[:] = enriched_rows
        except asyncio.TimeoutError:
            authority_status = "timeout"
            # Enrichment publishes only coordinator-owned completed row copies.
            # Preserve those fail-closed partial outcomes when the outer guard
            # fires; late parser/proof threads never mutate these rows.
            source_rows[:] = [copy.deepcopy(row) for row in authority_working_rows]
            for row in source_rows:
                row.setdefault(
                    "direct_fetch_status", "outer_stage_deadline_exceeded"
                )
                row.setdefault("jurisdiction_binding_status", "not_resolved")
            logger.warning(
                "Direct authority resolution reached its hard stage deadline; "
                "candidates=%s deadline_ms=%s",
                authority_candidate_count,
                int(_AUTHORITY_STAGE_DEADLINE_SECONDS * 1000),
            )
        authority_elapsed_ms = int((time.monotonic() - authority_started) * 1000)
        authority_retrieved_count = sum(
            row.get("direct_fetch_status") == "retrieved" for row in source_rows
        )
        authority_verified_count = sum(
            bool(row.get("authority_proof")) for row in source_rows
        )
        self.routing_diagnostics["authority_resolution"] = {
            "status": authority_status,
            "candidate_count": authority_candidate_count,
            "retrieved_count": authority_retrieved_count,
            "verified_count": authority_verified_count,
            "elapsed_ms": authority_elapsed_ms,
            "deadline_ms": int(_AUTHORITY_STAGE_DEADLINE_SECONDS * 1000),
        }
        logger.info(
            "Direct authority resolution finished; status=%s elapsed_ms=%s "
            "retrieved=%s verified=%s",
            authority_status,
            authority_elapsed_ms,
            authority_retrieved_count,
            authority_verified_count,
        )

        official_classes = {"statutory_current", "official_statistic"}
        unresolved_official_rows = [
            row
            for row in source_rows
            if row.get("direct_fetch_status") == "retrieved"
            and not row.get("authority_proof")
            and not str(row.get("jurisdiction_binding_status") or "").startswith(
                "rejected"
            )
            and official_classes.intersection(
                row.get("acquisition_evidence_classes") or []
            )
        ]
        if authority_status == "completed" and unresolved_official_rows:
            targeted_candidates = await self._targeted_authority_attestation_sources(
                unresolved_official_rows,
                search_services,
            )
            if targeted_candidates:
                targeted_started = time.monotonic()
                targeted_working = [
                    clone_authority_row(row) for row in unresolved_official_rows
                ] + [clone_authority_row(row) for row in targeted_candidates]
                logger.info(
                    "Targeted authority proof binding started; publishers=%s "
                    "attestation_candidates=%s deadline_ms=%s",
                    len(unresolved_official_rows),
                    len(targeted_candidates),
                    int(_AUTHORITY_STAGE_DEADLINE_SECONDS * 1000),
                )
                targeted_status = "completed"
                try:
                    targeted_enriched = await _await_with_hard_stage_deadline(
                        enrich_authority_sources(targeted_working),
                        deadline_seconds=_AUTHORITY_STAGE_DEADLINE_SECONDS,
                    )
                    for original, enriched in zip(
                        unresolved_official_rows,
                        targeted_enriched[: len(unresolved_official_rows)],
                    ):
                        original.clear()
                        original.update(enriched)
                except asyncio.TimeoutError:
                    targeted_status = "timeout"
                targeted_elapsed_ms = int(
                    (time.monotonic() - targeted_started) * 1000
                )
                targeted_verified_count = sum(
                    bool(row.get("authority_proof"))
                    for row in unresolved_official_rows
                )
                self.routing_diagnostics["targeted_authority_resolution"] = {
                    "status": targeted_status,
                    "candidate_count": len(targeted_candidates),
                    "publisher_count": len(unresolved_official_rows),
                    "verified_count": targeted_verified_count,
                    "elapsed_ms": targeted_elapsed_ms,
                    "deadline_ms": int(_AUTHORITY_STAGE_DEADLINE_SECONDS * 1000),
                }
                logger.info(
                    "Targeted authority proof binding finished; status=%s "
                    "elapsed_ms=%s verified=%s",
                    targeted_status,
                    targeted_elapsed_ms,
                    targeted_verified_count,
                )
                authority_retrieved_count = sum(
                    row.get("direct_fetch_status") == "retrieved" for row in source_rows
                )
                authority_verified_count = sum(
                    bool(row.get("authority_proof")) for row in source_rows
                )
                self.routing_diagnostics["authority_resolution"].update(
                    {
                        "retrieved_count": authority_retrieved_count,
                        "verified_count": authority_verified_count,
                        "targeted_attestation_used": True,
                    }
                )
        rejected_resolved = [
            row for row in source_rows
            if str(row.get("jurisdiction_binding_status") or "").startswith(
                "rejected"
            )
        ]
        for row in rejected_resolved:
            self.routing_diagnostics["rejected_cross_market_sources"].append(
                {
                    "provider": row.get("provider"),
                    "url": str(row.get("resolved_url") or row.get("url") or "")[:2048],
                    "reason": "resolved_document_not_bound_to_requested_market",
                }
            )
        attempted_source_ledger = []
        class_counts: Dict[str, Dict[str, int]] = {}
        for row in source_rows[:24]:
            classes = list(row.get("acquisition_evidence_classes") or [])[:4]
            for evidence_class in classes:
                counts = class_counts.setdefault(
                    evidence_class,
                    {"attempted": 0, "retrieved": 0, "verified": 0},
                )
                counts["attempted"] += 1
                if row.get("direct_fetch_status") == "retrieved":
                    counts["retrieved"] += 1
                if row.get("authority_proof"):
                    counts["verified"] += 1
            attempted_source_ledger.append(
                {
                    "retrieval_host": (
                        urlparse(str(row.get("retrieval_url") or row.get("url") or "")).hostname
                        or ""
                    )[:255],
                    "final_host": (
                        urlparse(str(row.get("resolved_url") or row.get("url") or "")).hostname
                        or ""
                    )[:255],
                    "acquisition_evidence_classes": classes,
                    "direct_fetch_status": str(
                        row.get("direct_fetch_status") or "not_attempted"
                    )[:80],
                    "jurisdiction_binding_status": str(
                        row.get("jurisdiction_binding_status") or "not_resolved"
                    )[:80],
                    "authority_verification_status": str(
                        row.get("authority_verification_status") or "unverified"
                    )[:120],
                }
            )
        self.routing_diagnostics["attempted_sources"] = attempted_source_ledger
        self.routing_diagnostics["evidence_class_acquisition"] = class_counts
        source_rows[:] = [
            row for row in source_rows
            if not str(row.get("jurisdiction_binding_status") or "").startswith(
                "rejected"
            )
        ]
        self._store_direct_web_evidence(source_rows, claim_rows)
        if (
            "statutory_current" in self.required_evidence_classes
            and self._provisional_statutory_claim_count() == 0
        ):
            await self._recover_missing_statutory_evidence(
                search_services,
                source_rows,
            )
        for claim in self.market_claims:
            evidence_class = str(claim.get("evidence_class") or "")
            if evidence_class in class_counts:
                class_counts[evidence_class]["claim_extracted"] = (
                    class_counts[evidence_class].get("claim_extracted", 0) + 1
                )
        surviving_sources_by_lineage = {
            str(token): source
            for source in source_rows
            for token in source.get("_provider_lineage_tokens") or ()
        }
        company_grounding_passages: List[tuple[str, tuple[str, ...]]] = []
        seen_company_passages: set[tuple[str, tuple[str, ...]]] = set()
        for claim_text, lineage_tokens in provider_claim_lineage_rows:
            canonical_urls = tuple(
                dict.fromkeys(
                    str(
                        source.get("resolved_url")
                        or ((source.get("_direct_document_candidate") or {}).get(
                            "final_url"
                        ))
                        or source.get("url")
                        or ""
                    )
                    for token in sorted(lineage_tokens)
                    if (source := surviving_sources_by_lineage.get(token))
                )
            )
            canonical_urls = tuple(url for url in canonical_urls if url)
            passage_identity = (claim_text, canonical_urls)
            if canonical_urls and passage_identity not in seen_company_passages:
                seen_company_passages.add(passage_identity)
                company_grounding_passages.append(passage_identity)

        if not company_grounding_passages:
            logger.warning("Web grounding returned no source-bearing evidence.")
            return []

        real_source_urls = list(
            dict.fromkeys(
                url
                for _claim_text, source_urls in company_grounding_passages
                for url in source_urls
            )
        )
        logger.info(
            "Market-aware web grounding returned %s source URLs.",
            len(real_source_urls),
        )
            
        class CompaniesListOut(BaseModel):
            companies: List[CompanyDiscoveryItem]
            
        agent = Agent(
            model=self.model,
            output_type=NativeOutput(CompaniesListOut),
            retries={"output": 1},
            system_prompt=f"""You are a B2B market intelligence parsing agent.
Your job is to read grounded search results for the authorized market
'{self.location}' and extract structured data without changing that market.

For each company mentioned in the search text, extract:
- id: a unique slug (e.g. company-name-slug)
- name: Official company name exactly as written in the search results
- industry: Industry vertical
- size: Employee count bucket if mentioned, otherwise 'Unknown'
- location: Office address in {self.location} if mentioned
- latitude / longitude: Only use coordinates supported by the text; otherwise use 0.0
- decision_makers: Only include names/titles that are EXPLICITLY mentioned in the search text. If none are mentioned, use an empty list []
- estimated_pain_points: Set to empty list []
- insights: "Discovered via Google Search grounding"
- website: Only include a URL if it is EXPLICITLY shown in the search text. If not mentioned, set to null
- contact_phone: Only include if EXPLICITLY shown in the search text. If not mentioned, set to null

CRITICAL RULES:
1. Only return companies that are CLEARLY named in the search text
2. Do NOT invent or fabricate website URLs, phone numbers, or person names
3. If the search text doesn't mention a company's website, leave it as null — do NOT guess a domain
4. If the search text doesn't name specific people, leave decision_makers as an empty list
5. Set all optional fields (linkedin_url, xing_url, email, etc.) to null
6. The location must explicitly demonstrate operation in '{self.location}'. Reject entities from other markets.
"""
        )
        
        claim_passages = "\n\n".join(
            "Grounded Claim:\n"
            f"{claim_text}\n"
            "Sources for this claim:\n"
            + "\n".join(f"- {url}" for url in source_urls)
            for claim_text, source_urls in company_grounding_passages
        )
        prompt = (
            "Grounded Search Claims (each exact claim is followed only by its "
            "own surviving source URLs):\n"
            f"{claim_passages}"
        )
        company_structuring_started = time.monotonic()
        company_structuring_deadline_ms = int(
            _COMPANY_STRUCTURING_DEADLINE_SECONDS * 1000
        )
        logger.info(
            "Grounded company structuring started; sources=%s deadline_ms=%s",
            len(real_source_urls),
            company_structuring_deadline_ms,
        )
        try:
            # This deadline covers the complete Agent run, including PydanticAI
            # output repair. It prevents a second hidden provider-scale wait
            # while leaving the existing schema, prompt, and retry quality
            # unchanged for normal responses.
            result = await _await_with_hard_stage_deadline(
                agent.run(prompt),
                deadline_seconds=_COMPANY_STRUCTURING_DEADLINE_SECONDS,
            )
            companies = result.output.companies

            source_urls_by_identity = {
                url.rstrip("/").casefold(): url
                for url in real_source_urls
            }
            # Retain only canonical URLs exposed alongside the exact provider
            # claim passages given to this parser. Unrelated official evidence
            # may remain in market_sources but cannot become a company website.
            for company in companies:
                company.insights = (
                    "Discovered via grounded web search. "
                    f"{len(real_source_urls)} source URLs consulted."
                )
                website_identity = str(company.website or "").rstrip("/").casefold()
                company.website = source_urls_by_identity.get(website_identity)
                company.pain_point_sources = None

            accepted = self._accept_market_companies(
                companies, provider="web_parser"
            )
            elapsed_ms = int(
                (time.monotonic() - company_structuring_started) * 1000
            )
            self.routing_diagnostics["company_structuring"] = {
                "status": "completed",
                "source_count": len(real_source_urls),
                "company_count": len(accepted),
                "elapsed_ms": elapsed_ms,
                "deadline_ms": company_structuring_deadline_ms,
            }
            self._record_provider(
                "web_parser",
                attempted=True,
                accepted=len(accepted),
                source_count=len(real_source_urls),
                details={
                    "evidence_class": "company_structuring",
                    "runtime": {
                        "route": "web_parser",
                        "status": "completed",
                        "elapsed_ms": elapsed_ms,
                        "deadline_ms": company_structuring_deadline_ms,
                        "call_count": 1,
                    },
                },
            )
            logger.info(
                "Grounded company structuring finished; status=completed "
                "elapsed_ms=%s companies=%s",
                elapsed_ms,
                len(accepted),
            )
            for row in reversed(self.routing_diagnostics["providers"]):
                if row["provider"] in {"gemini_google_search", "searxng"}:
                    row["accepted_company_count"] = len(accepted)
            return accepted
        except asyncio.TimeoutError:
            elapsed_ms = int(
                (time.monotonic() - company_structuring_started) * 1000
            )
            self.routing_diagnostics["company_structuring"] = {
                "status": "timeout",
                "source_count": len(real_source_urls),
                "company_count": 0,
                "elapsed_ms": elapsed_ms,
                "deadline_ms": company_structuring_deadline_ms,
            }
            self._record_provider(
                "web_parser",
                attempted=True,
                accepted=0,
                source_count=len(real_source_urls),
                reason="stage_timeout",
                details={
                    "evidence_class": "company_structuring",
                    "runtime": {
                        "route": "web_parser",
                        "status": "timeout",
                        "elapsed_ms": elapsed_ms,
                        "deadline_ms": company_structuring_deadline_ms,
                        "call_count": 1,
                    },
                },
            )
            logger.warning(
                "Grounded company structuring reached its hard stage deadline; "
                "elapsed_ms=%s deadline_ms=%s. Verified sources and claims are retained.",
                elapsed_ms,
                company_structuring_deadline_ms,
            )
            return []
        except Exception as e:
            elapsed_ms = int(
                (time.monotonic() - company_structuring_started) * 1000
            )
            self.routing_diagnostics["company_structuring"] = {
                "status": "failed",
                "source_count": len(real_source_urls),
                "company_count": 0,
                "elapsed_ms": elapsed_ms,
                "deadline_ms": company_structuring_deadline_ms,
                "error_type": type(e).__name__,
            }
            self._record_provider(
                "web_parser",
                attempted=True,
                accepted=0,
                source_count=len(real_source_urls),
                reason=f"parser_error:{type(e).__name__}",
                details={
                    "evidence_class": "company_structuring",
                    "runtime": {
                        "route": "web_parser",
                        "status": "failed",
                        "elapsed_ms": elapsed_ms,
                        "deadline_ms": company_structuring_deadline_ms,
                        "call_count": 1,
                    },
                },
            )
            logger.error(f"Failed to structure web search results: {e}", exc_info=True)
            return []

    async def _enrich_contacts_and_people(self, companies: List[CompanyDiscoveryItem]):
        """Enrich discovered companies with real websites, employee counts, and key people via Google Search.
        
        Does ONE search + ONE LLM call for the batch to avoid N sequential calls.
        """
        if not self.model:
            return

        try:
            from backend.services.generative.gemini_search_service import GeminiSearchService
            search_service = GeminiSearchService()
            if not search_service.is_available():
                return
        except ImportError:
            return

        # Build a single search query with all company names
        company_names = [c.name for c in companies[:10]]
        names_str = ", ".join(company_names)
        
        query = (
            f"For these companies in the authorized market '{self.location}': {names_str}. "
            f"Find their official website URLs, approximate number of employees, "
            f"and names of key management (CEO, Geschäftsführer, founder, CTO). "
            f"Only include factual information you can verify in that same market."
        )
        
        search_result = await asyncio.to_thread(search_service.search_web_general, query)
        if not search_result.get("search_performed") or not search_result.get("text"):
            logger.info("Contact enrichment search returned no results.")
            return

        class CompanyEnrichment(BaseModel):
            company_name: str
            website: Optional[str] = None
            employee_count: Optional[str] = None
            key_people: Optional[List[str]] = None

        class BatchEnrichmentOut(BaseModel):
            enrichments: List[CompanyEnrichment]

        agent = Agent(
            model=self.model,
            output_type=NativeOutput(BatchEnrichmentOut),
            system_prompt=f"""You are parsing REAL Google search results to find factual company details.

For each company listed below, extract from the search text:
- website: The REAL official website URL (e.g. https://www.personio.de). Only include if EXPLICITLY found in the text.
- employee_count: e.g. "500 employees" or "100-500 employees". Only if mentioned.
- key_people: Real names and titles of management. Format as ["CEO: John Smith", "CTO: Jane Doe"]. Only include names EXPLICITLY mentioned in the search text.

CRITICAL: Do NOT fabricate any data. If the search text doesn't mention a field, set it to null/empty.
Return one result per company, matched by name.
"""
        )

        company_list = "\n".join(f"- {name}" for name in company_names)
        prompt = f"""Companies to enrich:\n{company_list}\n\nSearch Results:\n{search_result.get('text')[:6000]}"""
        
        try:
            result = await agent.run(prompt)
            
            # Map enrichments back to companies
            enrichment_map = {}
            for e in result.output.enrichments:
                enrichment_map[e.company_name.lower().strip()] = e
            
            for company in companies[:10]:
                enrichment = enrichment_map.get(company.name.lower().strip())
                if not enrichment:
                    continue
                
                if enrichment.website and not company.website:
                    company.website = enrichment.website
                if enrichment.employee_count and (not company.size or company.size.lower() == 'unknown'):
                    company.size = enrichment.employee_count
                if enrichment.key_people and not company.decision_makers:
                    company.decision_makers = enrichment.key_people
            
            logger.info(f"Enriched {len(enrichment_map)} companies with contacts/people.")
        except Exception as e:
            logger.error(f"Contact/people enrichment failed: {e}", exc_info=True)

    async def _enrich_with_grounded_pain_points(self, companies: List[CompanyDiscoveryItem]) -> List[CompanyDiscoveryItem]:
        """Enrich companies with pain points in a SINGLE batch call to avoid N×2 sequential search calls."""
        if not self.model:
            return companies

        try:
            from backend.services.generative.gemini_search_service import GeminiSearchService
            search_service = GeminiSearchService()
            search_available = search_service.is_available()
        except ImportError:
            search_available = False

        # Do ONE batch search for the industry + location instead of per-company
        industry_evidence_text = ""
        industry_sources = []
        
        if search_available:
            try:
                # Single search: industry pain points in the region
                company_names = ", ".join(c.name for c in companies[:5])
                batch_query = (
                    f"Common operational challenges and pain points for companies in "
                    f"{self.location} working in {self.business_problem}. "
                    f"Include Kununu employee reviews, industry reports, and digital transformation challenges "
                    f"for companies like: {company_names}"
                )
                batch_result = await asyncio.to_thread(
                    search_service.search_web_general, batch_query
                )
                
                if batch_result.get("search_performed") and batch_result.get("text"):
                    industry_evidence_text = batch_result["text"][:5000]
                    for src in batch_result.get("sources", []):
                        url = src.get("url")
                        title = src.get("title", "Unknown")
                        if url:
                            # Skip generic domain-only URLs (e.g. kununu.com without /de/company-slug)
                            # Only keep URLs with meaningful paths
                            from urllib.parse import urlparse
                            parsed = urlparse(url)
                            path = parsed.path.strip("/")
                            if path and len(path) > 3:  # has a real path, not just "/"
                                industry_sources.append(f"{title}: {url}")
            except Exception as search_err:
                logger.error(f"Batch pain point search failed: {search_err}")

        # Single LLM call to generate pain points for ALL companies at once
        class CompanyPainPoints(BaseModel):
            company_name: str
            pain_points: List[str]
            pain_point_sentences: List[str]
        
        class BatchPainPointsOut(BaseModel):
            results: List[CompanyPainPoints]
        
        company_list_str = "\n".join(
            f"{i+1}. {c.name} — Industry: {c.industry}, Purpose: {(c.purpose or 'N/A')[:100]}"
            for i, c in enumerate(companies[:10])
        )
        
        source_context = ""
        if industry_evidence_text:
            source_context = f"""\n\nREAL INDUSTRY EVIDENCE (from Google Search):\n{industry_evidence_text}\n\nReal Source URLs:\n{chr(10).join(industry_sources[:5])}"""
        
        agent = Agent(
            model=self.model,
            output_type=NativeOutput(BatchPainPointsOut),
            system_prompt=f"""You are a B2B market analyst generating pain point assessments for companies in {self.location}.
Business problem context: '{self.business_problem}'
Target user role: '{self.target_user}'

For each company, generate:
1. pain_points: Exactly 3 concise pain points that are specific to their industry, registered purpose, and relevant to the business problem context.
2. pain_point_sentences: Exactly 3 full sentences or quotes providing detailed operational context or justification for each corresponding pain point (e.g. "Because of their manual legacy WZ database, SPARETECH spends up to 2 days mapping parts manually for plant managers."). If real search evidence is provided below, extract matching quotes or factual sentences. If not, write realistic justification sentences based on their company profile.

IMPORTANT: For each pain point, append a source tag:
- If it's based on real search evidence: "(Source: Industry research)"
- If it's an estimate based on industry profile: "(Source: Industry profile estimate)"

Do NOT fabricate specific metrics (like review scores) or URLs. Be honest about what is estimated vs. evidenced.
"""
        )
        
        prompt = f"""Companies to analyze:\n{company_list_str}{source_context}"""
        
        try:
            result = await agent.run(prompt)
            
            # Map results back to companies
            result_map = {
                r.company_name.lower().strip(): (r.pain_points, r.pain_point_sentences)
                for r in result.output.results
            }
            
            for company in companies[:10]:
                match = result_map.get(company.name.lower().strip())
                if match:
                    company.estimated_pain_points = match[0]
                    company.pain_point_sentences = match[1]
                    company.pain_point_sources = industry_sources[:3] if industry_sources else [
                        "Generated based on industry profile and registered business purpose"
                    ]
                else:
                    company.estimated_pain_points = [
                        f"Operational challenges typical for {company.industry} sector (Source: Industry profile estimate)"
                    ]
                    company.pain_point_sentences = [
                        f"Typically, firms in {company.industry} struggle with workflow efficiencies under {self.business_problem}."
                    ]
                    company.pain_point_sources = ["No specific public evidence found"]
        except Exception as e:
            logger.error(f"Batch pain point generation failed: {e}", exc_info=True)
            for company in companies:
                if not company.estimated_pain_points:
                    company.estimated_pain_points = [
                        f"Industry-typical challenges for {company.industry} (Source: Industry profile estimate)"
                    ]
                    company.pain_point_sentences = [
                        f"We estimate that {company.name} encounters coordination delays typical of the {company.industry} sector."
                    ]
                    company.pain_point_sources = ["Unable to verify — batch analysis failed"]

        return companies
