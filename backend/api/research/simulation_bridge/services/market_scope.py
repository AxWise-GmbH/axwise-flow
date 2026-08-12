"""Deterministic market boundaries for grounded regional research.

The authorized location is a trust boundary.  Models may derive an industry
keyword, but they must never replace the requested geography or select a
registry that cannot cover it.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Optional
from urllib.parse import urlparse

import pycountry


_GERMAN_LOCALITY_ALIASES = {
    "berlin": "Berlin",
    "bremen": "Bremen",
    "cologne": "Köln",
    "dortmund": "Dortmund",
    "dresden": "Dresden",
    "duesseldorf": "Düsseldorf",
    "düsseldorf": "Düsseldorf",
    "essen": "Essen",
    "frankfurt": "Frankfurt am Main",
    "hamburg": "Hamburg",
    "hannover": "Hannover",
    "köln": "Köln",
    "leipzig": "Leipzig",
    "munich": "München",
    "münchen": "München",
    "nuremberg": "Nürnberg",
    "nürnberg": "Nürnberg",
    "stuttgart": "Stuttgart",
}

_GENERIC_TLDS = {
    "com",
    "org",
    "net",
    "io",
    "ai",
    "app",
    "co",
    "info",
    "biz",
    "eu",
}


def _normalized(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").casefold()).strip()


def _country(value: str) -> Optional[Any]:
    candidate = str(value or "").strip(" .")
    if not candidate:
        return None
    try:
        return pycountry.countries.lookup(candidate)
    except LookupError:
        return None


def _country_from_location(value: str) -> Optional[Any]:
    text = str(value or "").strip()
    if not text:
        return None

    parts = [part.strip() for part in text.split(",") if part.strip()]
    for candidate in reversed(parts):
        match = _country(candidate)
        if match:
            return match

    words = text.split()
    for width in range(min(4, len(words)), 0, -1):
        match = _country(" ".join(words[-width:]))
        if match:
            return match
    return _country(text)


def _country_code_from_url(raw_url: Any) -> Optional[str]:
    try:
        host = (urlparse(str(raw_url or "")).hostname or "").casefold()
    except ValueError:
        return None
    suffix = host.rsplit(".", 1)[-1] if "." in host else ""
    if len(suffix) != 2 or suffix in _GENERIC_TLDS:
        return None
    match = _country(suffix)
    return str(match.alpha_2) if match else None


@dataclass(frozen=True)
class MarketScope:
    requested_location: str
    locality: Optional[str]
    country_code: Optional[str]
    country_name: Optional[str]

    @property
    def openregister_locality(self) -> Optional[str]:
        """Return an authorized German locality or disable OpenRegister."""

        if self.country_code != "DE" or not self.locality:
            return None
        return _GERMAN_LOCALITY_ALIASES.get(
            _normalized(self.locality), self.locality.strip()
        )

    @property
    def is_country_wide(self) -> bool:
        return not self.locality

    def company_matches(self, company: Any) -> bool:
        """Fail closed when a discovered company crosses the market boundary."""

        location = str(getattr(company, "location", "") or "").strip()
        website = getattr(company, "website", None)
        observed_country = _country_from_location(location)
        observed_code = str(observed_country.alpha_2) if observed_country else None
        url_code = _country_code_from_url(website)

        if self.country_code:
            if observed_code and observed_code != self.country_code:
                return False
            if url_code and url_code != self.country_code:
                return False

            country_evidenced = observed_code == self.country_code or url_code == self.country_code
            if self.country_name and _normalized(self.country_name) in _normalized(location):
                country_evidenced = True

            if self.is_country_wide:
                return country_evidenced

            requested_locality = self.requested_location.split(",", 1)[0]
            locality_tokens = {
                _normalized(self.locality),
                _normalized(requested_locality),
            }
            if any(token and token in _normalized(location) for token in locality_tokens):
                return True
            return False

        return _normalized(self.requested_location) in _normalized(location)

    def source_url_matches(self, raw_url: Any) -> bool:
        """Reject only explicit cross-country URL evidence; allow generic TLDs."""

        if not self.country_code:
            return True
        url_code = _country_code_from_url(raw_url)
        return url_code is None or url_code == self.country_code

    def evidence_text_matches(self, value: Any) -> bool:
        """Reject text that names only a different market than the request."""

        text = _normalized(value)
        if not text:
            return False

        mentioned_country_codes = set()
        for country in pycountry.countries:
            names = {
                _normalized(getattr(country, field, ""))
                for field in ("name", "official_name", "common_name")
            }
            if any(
                name and re.search(rf"\b{re.escape(name)}\b", text)
                for name in names
            ):
                mentioned_country_codes.add(str(country.alpha_2))

        if (
            mentioned_country_codes
            and self.country_code
            and self.country_code not in mentioned_country_codes
        ):
            return False

        mentioned_german_localities = {
            canonical
            for alias, canonical in _GERMAN_LOCALITY_ALIASES.items()
            if re.search(rf"\b{re.escape(alias)}\b", text)
        }
        if not mentioned_german_localities:
            return True

        requested_locality = _GERMAN_LOCALITY_ALIASES.get(
            _normalized(self.locality), self.locality
        )
        if self.country_code != "DE":
            target_country_named = self.country_name and re.search(
                rf"\b{re.escape(_normalized(self.country_name))}\b", text
            )
            return bool(target_country_named)
        if requested_locality and requested_locality not in mentioned_german_localities:
            return False
        return True


def resolve_market_scope(location: str) -> MarketScope:
    """Resolve a bounded country/locality without model inference."""

    requested = str(location or "").strip()
    country = _country_from_location(requested)
    country_code = str(country.alpha_2) if country else None
    country_name = str(country.name) if country else None

    comma_parts = [part.strip() for part in requested.split(",") if part.strip()]
    locality: Optional[str] = None
    if country:
        if len(comma_parts) > 1 and _country(comma_parts[-1]):
            locality = ", ".join(comma_parts[:-1]).strip() or None
        elif _country(requested):
            locality = None
        else:
            words = requested.split()
            for width in range(min(4, len(words)), 0, -1):
                if _country(" ".join(words[-width:])):
                    locality = " ".join(words[:-width]).strip() or None
                    break
    else:
        known = _GERMAN_LOCALITY_ALIASES.get(_normalized(requested))
        if known:
            locality = known
            country_code = "DE"
            country_name = "Germany"
        else:
            locality = requested or None

    return MarketScope(
        requested_location=requested,
        locality=locality,
        country_code=country_code,
        country_name=country_name,
    )
