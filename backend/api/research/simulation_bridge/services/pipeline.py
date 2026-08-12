"""
B2B Data Ingestion Pipeline for fetching, scraping, and scoring real-world regional company leads.
"""

import asyncio
import hashlib
import logging
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..models import CompanyDiscoveryItem
from .market_scope import resolve_market_scope

logger = logging.getLogger(__name__)


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
        }
        self.market_sources: List[Dict[str, Any]] = []
        self.market_claims: List[Dict[str, Any]] = []
        
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

        # OpenRegister is a German registry. Never send an unsupported market
        # to it and never ask a model to replace the authorized geography.
        if self.data_source in ("hybrid", "registry"):
            registry_location = self.market_scope.openregister_locality
            if self.openregister_key and registry_location:
                registry_companies = await self._fetch_from_openregister()
                accepted = self._accept_market_companies(
                    registry_companies, provider="openregister"
                )
                discovered.extend(accepted)
                self._record_provider(
                    "openregister", attempted=True, accepted=len(accepted)
                )
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
            web_companies = await self._discover_via_web_search()
            web_companies = self._accept_market_companies(
                web_companies, provider="web"
            )
            if web_companies:
                discovered.extend(
                    self._accept_market_companies(
                        web_companies, provider="web_enrichment"
                    )
                )

        companies = self._deduplicate_companies(discovered)
        self.routing_diagnostics["accepted_company_count"] = len(companies)
        if not companies:
            logger.warning(
                "All market-compatible discovery methods exhausted for %s.",
                self.location,
            )
            return []

        # Contact discovery and pain-point evidence read the same bounded
        # company snapshot but populate disjoint fields. Running the two batch
        # routes together removes one full search+parse latency chain without
        # reducing evidence, sources, or output detail.
        await asyncio.gather(
            self._enrich_contacts_and_people(companies),
            self._enrich_with_grounded_pain_points(companies),
        )
        return companies

    def _record_provider(
        self,
        provider: str,
        *,
        attempted: bool,
        accepted: int,
        source_count: int = 0,
        reason: Optional[str] = None,
    ) -> None:
        self.routing_diagnostics["providers"].append(
            {
                "provider": provider,
                "attempted": attempted,
                "accepted_company_count": accepted,
                "source_count": source_count,
                "reason": reason,
            }
        )

    @staticmethod
    def _evidence_id(prefix: str, value: str) -> str:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:20]
        return f"{prefix}-{digest}"

    @staticmethod
    def _source_authority(url: str) -> str:
        hostname = (urlparse(url).hostname or "").casefold()
        if (
            hostname.endswith(".gov")
            or ".gov." in hostname
            or hostname == "europa.eu"
            or hostname.endswith(".europa.eu")
        ):
            return "official_public"
        if hostname.endswith((".edu", ".ac.uk")):
            return "academic"
        return "independent_web"

    def _store_direct_web_evidence(
        self,
        source_rows: List[Dict[str, Any]],
        claim_rows: List[Dict[str, Any]],
    ) -> None:
        source_id_by_url = {}
        sources_by_id = {}
        for row in source_rows:
            url = str(row.get("url") or "")
            source_id = self._evidence_id("source", url)
            source_id_by_url[url] = source_id
            sources_by_id[source_id] = {
                "source_id": source_id,
                "source_type": "google_search_result",
                "url": url,
                "title": str(row.get("title") or url)[:500],
                "publisher": urlparse(url).hostname,
                "registry": None,
                "market_location": self.location,
                "source_authority": self._source_authority(url),
                "search_provider": row.get("provider"),
            }

        linked_source_ids = set()
        for row in claim_rows:
            if not isinstance(row, dict):
                continue
            text = str(row.get("text") or "").strip()[:2000]
            if text and not self.market_scope.evidence_text_matches(text):
                self.routing_diagnostics["rejected_cross_market_claims"].append(
                    {
                        "text_hash": self._evidence_id("claim", text),
                    }
                )
                continue
            source_ids = [
                source_id_by_url[url]
                for url in row.get("source_urls") or []
                if url in source_id_by_url
            ]
            if not text or not source_ids:
                continue
            linked_source_ids.update(source_ids)
            identity = f"{text}|{'|'.join(sorted(set(source_ids)))}"
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
                }
            )
        self.market_sources.extend(
            row
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
                output_type=OpenRegisterQueryParams,
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
            base_lat, base_lon = coords if coords else (51.1657, 10.4515)
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
                output_type=GeocodeResults,
                system_prompt=f"""You are a geocoding helper.
Given a list of company addresses in or around '{self.location}', estimate realistic latitude and longitude coordinates for each.
They must be physically located in Germany near the target city.
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
            base_lat, base_lon = coords if coords else (51.1657, 10.4515)
            import random
            for c in companies:
                if c.latitude == 0.0:
                    c.latitude = base_lat + random.uniform(-0.04, 0.04)
                    c.longitude = base_lon + random.uniform(-0.04, 0.04)

    async def _discover_via_web_search(self) -> List[CompanyDiscoveryItem]:
        """Discover real market entities using bounded, source-bearing web routes."""
        if not self.model:
            return []

        try:
            from backend.services.generative.gemini_search_service import GeminiSearchService
        except ImportError:
            logger.warning("GeminiSearchService not available.")
            return []
        
        search_services = []
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
            return []

        query = (
            f"Research the market explicitly and only for: '{self.location}'. "
            f"Do not substitute another city, country, or region. Find current, verifiable "
            f"evidence relevant to: '{self.business_problem}' and target stakeholder "
            f"'{self.target_user}'. Prefer national or supranational regulators, official "
            f"statistics, official company registries, official company websites, and "
            f"recognized industry bodies. Identify real organizations operating in the "
            f"authorized market and include an explicit headquarters or operating location."
        )

        texts = []
        source_rows = []
        claim_rows = []
        seen_urls = set()
        for provider, search_service in search_services:
            try:
                # Both provider SDKs expose synchronous search methods. Run them
                # off the event loop so independent market cells can genuinely
                # progress concurrently instead of serializing on network I/O.
                search_result = await asyncio.to_thread(
                    search_service.search_web_general, query
                )
            except Exception as exc:
                logger.warning(
                    "Grounded search provider %s failed with %s.",
                    provider,
                    type(exc).__name__,
                )
                self._record_provider(
                    provider,
                    attempted=True,
                    accepted=0,
                    source_count=0,
                    reason=f"provider_error:{type(exc).__name__}",
                )
                continue
            provider_sources = search_result.get("sources") or []
            performed = bool(search_result.get("search_performed"))
            if performed and search_result.get("text"):
                texts.append(str(search_result["text"])[:12000])
            claim_rows.extend(
                row
                for row in (search_result.get("claims") or [])
                if isinstance(row, dict)
            )
            for source in provider_sources:
                if not isinstance(source, dict):
                    continue
                url = str(source.get("url") or "").strip()
                if not url or url in seen_urls:
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
                seen_urls.add(url)
                source_rows.append(
                    {
                        "title": str(source.get("title") or "Unknown")[:500],
                        "url": url,
                        "provider": provider,
                    }
                )

            accepted_provider_urls = {
                row["url"] for row in source_rows if row["provider"] == provider
            }
            self._record_provider(
                provider,
                attempted=True,
                accepted=0,
                source_count=len(accepted_provider_urls),
                reason=None if performed else "empty_or_failed",
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
            authoritative_urls = {
                row["url"]
                for row in source_rows
                if row["url"] in linked_urls
                and self._source_authority(row["url"]) in {"official_public", "academic"}
            }
            if (
                len(linked_urls) >= self.minimum_source_count
                and len(authoritative_urls) >= self.minimum_authoritative_source_count
            ):
                break

        self._store_direct_web_evidence(source_rows, claim_rows)
        if not texts or not source_rows:
            logger.warning("Web grounding returned no source-bearing evidence.")
            return []

        real_source_urls = [
            f"{source['title']}: {source['url']}" for source in source_rows[:20]
        ]
        logger.info(
            "Market-aware web grounding returned %s source URLs.",
            len(real_source_urls),
        )
            
        class CompaniesListOut(BaseModel):
            companies: List[CompanyDiscoveryItem]
            
        agent = Agent(
            model=self.model,
            output_type=CompaniesListOut,
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
        
        sources_text = ""
        if real_source_urls:
            sources_text = "\n\nGrounding Sources (provider-returned URLs):\n" + "\n".join(
                f"- {s}" for s in real_source_urls
            )

        prompt = f"""Grounded Search Results:\n{chr(10).join(texts)}\n{sources_text}"""
        try:
            result = await agent.run(prompt)
            companies = result.output.companies

            source_urls_by_identity = {
                source["url"].rstrip("/").casefold(): source["url"]
                for source in source_rows
            }
            # Retain only URLs returned by a grounding provider. Claim/source
            # linkage is stored separately; never attach every source to every
            # parsed company as if it supported that entity.
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
            for row in reversed(self.routing_diagnostics["providers"]):
                if row["provider"] in {"gemini_google_search", "searxng"}:
                    row["accepted_company_count"] = len(accepted)
            return accepted
        except Exception as e:
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
            output_type=BatchEnrichmentOut,
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
            output_type=BatchPainPointsOut,
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
