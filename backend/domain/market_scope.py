"""Versioned, deterministic market-scope contracts shared by AxWise pipelines.

Models may interpret user language into selectors, but they never define group
membership.  This module expands confirmed selectors into an immutable ISO
country snapshot that can be hashed, audited, and processed as research cells.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Literal, Optional

import pycountry
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MARKET_SCOPE_SCHEMA_VERSION = "market_scope_v2"
MARKET_TAXONOMY_VERSION = "axwise-market-groups-2026-08"


class StrictMarketModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MarketGroupDefinition(StrictMarketModel):
    group_id: str
    label: str
    group_type: Literal[
        "business_region",
        "geographic_region",
        "economic_bloc",
        "regulatory_area",
    ]
    aliases: List[str] = Field(default_factory=list)
    members: List[str]
    membership_policy: Literal["fixed", "versioned", "user_confirmed"] = "fixed"
    requires_confirmation: bool = False


# This is deliberately a versioned catalogue, not prompt knowledge.  Ambiguous
# or politically sensitive groupings remain user-confirmed even when AxWise can
# offer a useful proposed expansion.
MARKET_GROUPS: Dict[str, MarketGroupDefinition] = {
    row.group_id: row
    for row in [
        MarketGroupDefinition(
            group_id="business_region:benelux",
            label="BENELUX",
            group_type="business_region",
            aliases=["benelux"],
            members=["BE", "NL", "LU"],
        ),
        MarketGroupDefinition(
            group_id="business_region:dach",
            label="DACH",
            group_type="business_region",
            aliases=["dach", "d-a-ch"],
            members=["DE", "AT", "CH"],
        ),
        MarketGroupDefinition(
            group_id="business_region:dachli",
            label="DACHLI",
            group_type="business_region",
            aliases=["dachli", "dach+", "dach plus liechtenstein"],
            members=["DE", "AT", "CH", "LI"],
        ),
        MarketGroupDefinition(
            group_id="business_region:baltics",
            label="Baltics",
            group_type="business_region",
            aliases=["baltics", "baltic states", "baltic countries"],
            members=["EE", "LV", "LT"],
        ),
        MarketGroupDefinition(
            group_id="business_region:nordics",
            label="Nordics",
            group_type="business_region",
            aliases=["nordics", "nordic countries", "nordic region"],
            members=["DK", "FI", "IS", "NO", "SE"],
        ),
        MarketGroupDefinition(
            group_id="geographic_region:southeast_asia",
            label="Southeast Asia",
            group_type="geographic_region",
            aliases=["southeast asia", "south east asia"],
            members=["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"],
            membership_policy="versioned",
        ),
        MarketGroupDefinition(
            group_id="economic_bloc:asean",
            label="ASEAN",
            group_type="economic_bloc",
            aliases=["asean"],
            members=["BN", "KH", "ID", "LA", "MY", "MM", "PH", "SG", "TH", "TL", "VN"],
            membership_policy="versioned",
        ),
        MarketGroupDefinition(
            group_id="geographic_region:southern_europe_un_m49",
            label="Southern Europe (UN M49)",
            group_type="geographic_region",
            aliases=["southern europe", "south europe"],
            members=[
                "AL", "AD", "BA", "HR", "GI", "GR", "VA", "IT", "MT",
                "ME", "MK", "PT", "SM", "RS", "SI", "ES",
            ],
            membership_policy="versioned",
            requires_confirmation=True,
        ),
        MarketGroupDefinition(
            group_id="geographic_region:balkans_proposed",
            label="Balkans (proposed commercial scope)",
            group_type="geographic_region",
            aliases=["balkans", "balkan countries", "balkan region"],
            members=["AL", "BA", "BG", "HR", "GR", "XK", "ME", "MK", "RO", "RS", "SI"],
            membership_policy="user_confirmed",
            requires_confirmation=True,
        ),
        MarketGroupDefinition(
            group_id="economic_bloc:eu",
            label="European Union",
            group_type="economic_bloc",
            aliases=["eu", "european union", "eu27"],
            members=[
                "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
                "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
                "PL", "PT", "RO", "SK", "SI", "ES", "SE",
            ],
            membership_policy="versioned",
        ),
        MarketGroupDefinition(
            group_id="economic_bloc:efta",
            label="EFTA",
            group_type="economic_bloc",
            aliases=["efta"],
            members=["IS", "LI", "NO", "CH"],
            membership_policy="versioned",
        ),
        MarketGroupDefinition(
            group_id="regulatory_area:eea",
            label="European Economic Area",
            group_type="regulatory_area",
            aliases=["eea", "european economic area"],
            members=[
                "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
                "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
                "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
            ],
            membership_policy="versioned",
        ),
    ]
}


AMBIGUOUS_GROUP_ALIASES: Dict[str, List[str]] = {
    "sea": ["geographic_region:southeast_asia", "economic_bloc:asean"],
    "south east asian markets": [
        "geographic_region:southeast_asia",
        "economic_bloc:asean",
    ],
}


def _normal(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def _country(value: str) -> Optional[Any]:
    candidate = str(value or "").strip(" .")
    if not candidate:
        return None
    aliases = {
        "uk": "GB",
        "u k": "GB",
        "usa": "US",
        "u s a": "US",
        "u s": "US",
        "south korea": "KR",
        "north korea": "KP",
        "russia": "RU",
        "vietnam": "VN",
    }
    candidate = aliases.get(_normal(candidate), candidate)
    try:
        return pycountry.countries.lookup(candidate)
    except LookupError:
        return None


def _country_name(code: str) -> str:
    match = pycountry.countries.get(alpha_2=code)
    if match:
        return str(match.name)
    # XK is widely used operationally but is not an assigned ISO 3166 code.
    return "Kosovo" if code == "XK" else code


def market_group_for_alias(value: str) -> Optional[MarketGroupDefinition]:
    key = _normal(value)
    for group in MARKET_GROUPS.values():
        if key in {_normal(group.label), *(_normal(alias) for alias in group.aliases)}:
            return group
    return None


class MarketSelector(StrictMarketModel):
    operation: Literal["include", "exclude", "prioritize"] = "include"
    kind: Literal["named_group", "countries", "custom"]
    group_id: Optional[str] = None
    country_codes: List[str] = Field(default_factory=list, max_length=64)
    raw_expression: Optional[str] = Field(default=None, max_length=500)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)

    @field_validator("country_codes")
    @classmethod
    def normalize_codes(cls, values: List[str]) -> List[str]:
        return list(dict.fromkeys(str(value).upper() for value in values))


class ResolvedMarket(StrictMarketModel):
    country_code: str = Field(min_length=2, max_length=2)
    country_name: str = Field(min_length=2, max_length=120)
    priority: Literal["primary", "standard"] = "standard"
    localities: List[str] = Field(default_factory=list, max_length=50)
    research_depth: Literal["quick", "standard", "deep"] = "standard"

    @field_validator("country_code")
    @classmethod
    def uppercase_code(cls, value: str) -> str:
        return value.upper()


class ResolvedMarketSet(StrictMarketModel):
    countries: List[ResolvedMarket] = Field(default_factory=list, max_length=64)
    excluded_country_codes: List[str] = Field(default_factory=list, max_length=64)
    coverage_mode: Literal[
        "every_market_deep",
        "weighted",
        "reconnaissance_then_select",
        "representative_sample",
    ] = "weighted"


class MarketScopeConfirmation(StrictMarketModel):
    required: bool = False
    confirmed: bool = False
    reason: Optional[str] = Field(default=None, max_length=1000)


class MarketScopeV2(StrictMarketModel):
    schema_version: Literal["market_scope_v2"] = MARKET_SCOPE_SCHEMA_VERSION
    raw_input: str = Field(min_length=1, max_length=2000)
    selectors: List[MarketSelector] = Field(default_factory=list, max_length=100)
    resolved_scope: ResolvedMarketSet
    ambiguities: List[Dict[str, Any]] = Field(default_factory=list, max_length=20)
    taxonomy_versions: Dict[str, str] = Field(
        default_factory=lambda: {
            "countries": "iso3166",
            "market_groups": MARKET_TAXONOMY_VERSION,
        }
    )
    resolution_hash: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    confirmation: MarketScopeConfirmation = Field(default_factory=MarketScopeConfirmation)

    @model_validator(mode="after")
    def validate_resolution(self) -> "MarketScopeV2":
        country_codes = [item.country_code for item in self.resolved_scope.countries]
        if len(country_codes) != len(set(country_codes)):
            raise ValueError("market scope countries must be unique")
        if set(country_codes) & set(self.resolved_scope.excluded_country_codes):
            raise ValueError("market scope cannot include and exclude the same country")
        expected = market_scope_hash(self)
        if self.resolution_hash and self.resolution_hash != expected:
            raise ValueError("market scope resolution_hash does not match its content")
        self.resolution_hash = expected
        return self


def _hash_payload(scope: MarketScopeV2) -> Dict[str, Any]:
    payload = scope.model_dump(mode="json", exclude={"resolution_hash", "confirmation"})

    # JSON has one number type, while Python's encoder distinguishes 1.0 from
    # JavaScript's canonical 1. Normalize integral floats so Orqaly and AxWise
    # calculate the same immutable scope hash.
    def js_numbers(value: Any) -> Any:
        if isinstance(value, float) and value.is_integer():
            return int(value)
        if isinstance(value, list):
            return [js_numbers(item) for item in value]
        if isinstance(value, dict):
            return {key: js_numbers(item) for key, item in value.items()}
        return value

    return js_numbers(payload)


def market_scope_hash(scope: MarketScopeV2) -> str:
    canonical = json.dumps(
        _hash_payload(scope), sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _split_expressions(value: str) -> List[str]:
    text = str(value or "").strip()
    if not text:
        return []
    locality_parts = [part.strip() for part in text.split(",") if part.strip()]
    if (
        len(locality_parts) == 2
        and not _country(locality_parts[0])
        and _country(locality_parts[1])
    ):
        return [text]
    if re.search(r"\+|;|\band\b", text, flags=re.IGNORECASE):
        return [
            nested
            for item in re.split(r"\s*(?:\+|;|\band\b)\s*", text, flags=re.IGNORECASE)
            if item.strip()
            for nested in _split_expressions(item)
        ]
    if _country(text) or market_group_for_alias(text) or _normal(text) in AMBIGUOUS_GROUP_ALIASES:
        return [text]
    return [
        item.strip()
        for item in re.split(r"\s*,\s*", text, flags=re.IGNORECASE)
        if item.strip()
    ]


def resolve_market_expression(
    raw_input: str,
    *,
    coverage_mode: str = "weighted",
) -> MarketScopeV2:
    """Resolve a bounded market expression without model-selected membership."""

    raw = str(raw_input or "").strip()
    if not raw:
        raise ValueError("market scope is required")

    base = raw
    exclusions = ""
    priorities = ""
    modifier_pattern = re.compile(
        r"\b(excluding|exclude|except|without|prioritize|prioritise|prioritized|"
        r"prioritised|prioritizing|prioritising|primarily|especially|focus on|focused on)\b",
        flags=re.IGNORECASE,
    )
    modifiers = list(modifier_pattern.finditer(base))
    if modifiers:
        original = base
        base = original[: modifiers[0].start()].strip(" ,;")
        for index, match in enumerate(modifiers):
            end = modifiers[index + 1].start() if index + 1 < len(modifiers) else None
            value = original[match.end() : end].strip(" ,;")
            if match.group(1).casefold() in {
                "excluding",
                "exclude",
                "except",
                "without",
            }:
                exclusions = value
            else:
                priorities = value

    included: Dict[str, ResolvedMarket] = {}
    excluded_codes: List[str] = []
    selectors: List[MarketSelector] = []
    ambiguities: List[Dict[str, Any]] = []
    confirmation_required = False

    def resolve_part(part: str, operation: str) -> None:
        nonlocal confirmation_required
        key = _normal(part)
        ambiguous = AMBIGUOUS_GROUP_ALIASES.get(key)
        if ambiguous:
            ambiguities.append(
                {
                    "raw_expression": part,
                    "candidate_group_ids": ambiguous,
                    "reason": "named market expression has multiple recognized definitions",
                }
            )
            confirmation_required = True
            return
        group = market_group_for_alias(part)
        locality_parts = [value.strip() for value in part.split(",") if value.strip()]
        locality_country = (
            _country(locality_parts[1])
            if len(locality_parts) == 2
            and not _country(locality_parts[0])
            else None
        )
        locality = locality_parts[0] if locality_country else None
        country = locality_country or _country(part)
        if group:
            codes = group.members
            selectors.append(
                MarketSelector(
                    operation=operation,
                    kind="named_group",
                    group_id=group.group_id,
                    country_codes=codes,
                    raw_expression=part,
                )
            )
            confirmation_required = confirmation_required or group.requires_confirmation
        elif country:
            codes = [str(country.alpha_2)]
            selectors.append(
                MarketSelector(
                    operation=operation,
                    kind="countries",
                    country_codes=codes,
                    raw_expression=part,
                )
            )
        else:
            ambiguities.append(
                {
                    "raw_expression": part,
                    "candidate_group_ids": [],
                    "reason": "market expression requires interpretation and explicit country confirmation",
                }
            )
            confirmation_required = True
            return

        for code in codes:
            if operation == "exclude":
                if code not in excluded_codes:
                    excluded_codes.append(code)
                included.pop(code, None)
            else:
                current = included.get(code)
                priority = "primary" if operation == "prioritize" else "standard"
                depth = "deep" if priority == "primary" else "standard"
                included[code] = ResolvedMarket(
                    country_code=code,
                    country_name=_country_name(code),
                    priority=("primary" if current and current.priority == "primary" else priority),
                    research_depth=("deep" if current and current.research_depth == "deep" else depth),
                    localities=(
                        [locality]
                        if locality
                        and locality_country
                        and code == str(locality_country.alpha_2)
                        else []
                    ),
                )

    for expression in _split_expressions(base):
        resolve_part(expression, "include")
    for expression in _split_expressions(exclusions):
        resolve_part(expression, "exclude")
    for expression in _split_expressions(priorities):
        resolve_part(expression, "prioritize")

    for code in excluded_codes:
        included.pop(code, None)

    return MarketScopeV2(
        raw_input=raw,
        selectors=selectors,
        resolved_scope=ResolvedMarketSet(
            countries=list(included.values()),
            excluded_country_codes=excluded_codes,
            coverage_mode=coverage_mode,
        ),
        ambiguities=ambiguities,
        confirmation=MarketScopeConfirmation(
            required=confirmation_required,
            confirmed=False,
            reason=(
                "Confirm the exact country expansion before grounded research"
                if confirmation_required
                else None
            ),
        ),
    )


def research_cells(scope: MarketScopeV2) -> List[Dict[str, Any]]:
    """Create country cells plus a comparison cell without duplicating shared work."""

    cells = [
        {
            "cell_id": f"country:{market.country_code}",
            "country_codes": [market.country_code],
            "country_name": market.country_name,
            "localities": market.localities,
            "priority": market.priority,
            "research_depth": market.research_depth,
            "minimum_structured_sources": 3,
            "minimum_official_sources": 1,
        }
        for market in scope.resolved_scope.countries
    ]
    if len(cells) > 1:
        cells.append(
            {
                "cell_id": "comparison:" + "+".join(
                    market.country_code for market in scope.resolved_scope.countries
                ),
                "country_codes": [
                    market.country_code for market in scope.resolved_scope.countries
                ],
                "purpose": "cross_market_synthesis",
                "may_not_replace_country_cells": True,
            }
        )
    return cells
