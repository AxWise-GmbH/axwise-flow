"""Direct-source authority proofs for consequential grounded research.

The evaluator never trusts a producer-supplied ``source_authority`` label.  A
public authority on a non-government domain must be fetched directly and be
linked from an independently fetched government/EU root.  Proofs bind both
documents, their final HTTPS hosts, jurisdiction, excerpts, and retrieval time.
"""

from __future__ import annotations

import asyncio
import calendar
import functools
import hashlib
import hmac
import html
import ipaddress
import json
import math
import os
import re
import socket
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from typing import Any, Awaitable, Callable, Dict, Iterable, Mapping, Optional
from urllib.parse import urljoin, urlparse

import httpx
import pycountry
from bs4 import BeautifulSoup, NavigableString, Tag


AUTHORITY_PROOF_VERSION = "direct_authority_attestation_v1"
AUTHORITY_CLAIM_PROOF_VERSION = "direct_authority_claim_span_v1"
AUTHORITY_STRUCTURED_CLAIM_PROOF_VERSION = (
    "derived_structured_statistical_claim_v1"
)
_AUTHORITY_LANGUAGE = re.compile(
    r"\b(?:government|ministry|tax(?:ation)?(?: and customs)? (?:board|authority)|"
    r"customs (?:board|authority)|public authority|national statistics|statistics "
    r"office|regulator|regulatory authority|state agency|government agency)\b",
    re.IGNORECASE,
)
_NAMED_STATISTICS_AUTHORITY = re.compile(
    r"\bStatistics\s+[A-ZÀ-Ž][A-Za-zÀ-ž-]{2,}\b"
)
_PRIMARY_MARKET_LANGUAGE = re.compile(
    r"\b(?:price|priced|cost|fee|retail|catalog(?:ue)?|product|supplier|"
    r"distributor|channel|available|in stock)\b",
    re.IGNORECASE,
)
_ISO_CURRENCY_CODES = "|".join(
    sorted(re.escape(str(item.alpha_3)) for item in pycountry.currencies)
)
_PRIMARY_MARKET_VALUE = re.compile(
    rf"(?<!\w)(?:"
    rf"(?:(?:{_ISO_CURRENCY_CODES})|[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾])\s*"
    rf"-?(?:\d{{1,3}}(?:[ \u00a0,]\d{{3}})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)|"
    rf"-?(?:\d{{1,3}}(?:[ \u00a0,]\d{{3}})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*"
    rf"(?:{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?|yen|yuan|rupees?|"
    rf"[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾])"
    rf")(?!\w)",
    re.IGNORECASE,
)
_STRUCTURED_OFFER_FIELDS = re.compile(
    r"\b(?:sku|gtin(?:8|12|13|14)?|ean|mpn|pricecurrency|pricesimple|"
    r"availability)\b",
    re.IGNORECASE,
)
_CURRENT_PRICE_ROLE = re.compile(
    r"\b(?:current|our|your|now|sale|promo(?:tional)?|member|online|"
    r"available|availability|in[ -]?stock|hind|price|cost)\b",
    re.IGNORECASE,
)
_NON_OFFER_PRICE_ROLE = re.compile(
    r"\b(?:old|was|list|recommended|rrp|msrp|delivery|shipping|"
    r"postage|fee|cart|basket|checkout|subtotal|threshold)\b",
    re.IGNORECASE,
)
_VISIBLE_CURRENT_PRICE_LABEL_TOKENS_V1 = frozenset(
    {
        "available",
        "availability",
        "cost",
        "current",
        "hind",
        "in",
        "instock",
        "is",
        "member",
        "now",
        "offer",
        "online",
        "product",
        "our",
        "price",
        "promo",
        "promotional",
        "regular",
        "retail",
        "sale",
        "sku",
        "stock",
        "tavahind",
        "the",
        "your",
    }
)
_CURRENT_OFFER_AVAILABILITY_V1 = frozenset(
    {"", "instock", "limitedavailability", "onlineonly"}
)
_VISIBLE_UNAVAILABLE_OFFER_V1 = re.compile(
    r"(?:\b(?:out[ -]?of[ -]?stock|sold[ -]?out|discontinued|unavailable|"
    r"not\s+(?:currently\s+)?available)\b|"
    r"(?<!\w)(?:laost\s+otsas|pole\s+saadaval|ei\s+ole\s+saadaval|"
    r"välja\s+müüdud)(?!\w))",
    re.IGNORECASE,
)


def _canonical_offer_availability(
    value: Any, *, signal_type: str
) -> str | None:
    """Project schema.org availability onto the closed current-offer set."""

    normalized = "".join(str(value or "").split())
    if not normalized:
        return ""
    if normalized == "in_stock":
        return "instock" if signal_type == "merchant_product_config" else None
    match = re.fullmatch(
        r"(?:https?://schema\.org/)?([A-Za-z]+)", normalized, re.IGNORECASE
    )
    if match is None:
        return None
    status = match.group(1).casefold()
    return status if status in _CURRENT_OFFER_AVAILABILITY_V1 else None


_MAX_RETAINED_AUTHORITY_TEXT = 100_000
_MAX_DIRECT_FETCH_CONCURRENCY = 8
_MAX_DIRECT_FETCH_REDIRECTS = 3
_DIRECT_FETCH_OPERATION_SECONDS = 30.0
_DIRECT_FETCH_ATTEMPT_SECONDS = 10.0
_DIRECT_FETCH_DNS_SECONDS = 5.0
_AUTHORITY_ENRICHMENT_SECONDS = 45.0
_AUTHORITY_PROOF_RESERVE_SECONDS = 15.0
_AUTHORITY_PARSE_EXECUTOR = ThreadPoolExecutor(
    max_workers=_MAX_DIRECT_FETCH_CONCURRENCY,
    thread_name_prefix="authority-parse",
)
_AUTHORITY_PROOF_EXECUTOR = ThreadPoolExecutor(
    max_workers=_MAX_DIRECT_FETCH_CONCURRENCY,
    thread_name_prefix="authority-proof",
)
_EU_COUNTRY_CODES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL",
    "PT", "RO", "SE", "SI", "SK",
}

# Code-owned acquisition hints for public authority directories whose stable,
# directly fetchable pages are known independently of search-provider ranking.
# A registry hit grants no authority.  The hinted page must still pass the same
# HTTPS/SSRF/redirect/challenge gates, resolve to a recognized public root, bind
# the requested jurisdiction in visible text, name the exact resolved publisher
# host, identify a public authority, and participate in the signed two-document
# proof before a source can be promoted.
_AUTHORITY_ATTESTATION_ACQUISITION_HINTS: Mapping[
    tuple[str, str], tuple[str, ...]
] = {
    (
        "EE",
        "www.emta.ee",
    ): (
        "https://anti-fraud.ec.europa.eu/organisations/"
        "tax-and-customs-board_en",
    ),
}


class RetrievalChallengeError(ValueError):
    """A fetched response is an anti-bot interstitial, not publisher content."""


_HIDDEN_STYLE_DECLARATION = re.compile(
    r"(?:^|;)\s*(?:"
    r"display\s*:\s*none|"
    r"visibility\s*:\s*(?:hidden|collapse)|"
    r"content-visibility\s*:\s*hidden|"
    r"opacity\s*:\s*(?:0+(?:\.0+)?|\.0+)"
    r")\s*(?:!\s*important\s*)?(?:;|$)",
    re.IGNORECASE,
)


def _looks_like_retrieval_challenge(
    headers: Mapping[str, Any], body: str
) -> bool:
    """Recognize only high-confidence challenge signals and fail closed."""

    mitigated = str(headers.get("cf-mitigated") or "").strip().casefold()
    if mitigated == "challenge":
        return True
    sample = str(body or "")[:100_000].casefold()
    return (
        "/cdn-cgi/challenge-platform/" in sample
        and (
            "window._cf_chl_opt" in sample
            or "cf_chl_" in sample
            or "enable javascript and cookies to continue" in sample
        )
    )


class _VisibleTextParser(HTMLParser):
    """Small dependency-free extractor for deterministic citation text."""

    _HTML_VOID_ELEMENTS = frozenset(
        {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }
    )

    def __init__(
        self,
        *,
        css_hidden_classes: frozenset[str] = frozenset(),
        css_hidden_ids: frozenset[str] = frozenset(),
    ) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._hidden_depth = 0
        self._element_stack: list[dict[str, Any]] = []
        self._css_hidden_classes = css_hidden_classes
        self._css_hidden_ids = css_hidden_ids

    def _element_is_hidden(
        self,
        tag: str, attrs: list[tuple[str, Optional[str]]]
    ) -> bool:
        if tag.casefold() in {"script", "style", "noscript", "template"}:
            return True
        normalized = {
            str(name).casefold(): "" if value is None else str(value).strip()
            for name, value in attrs
        }
        if "hidden" in normalized:
            return True
        if normalized.get("aria-hidden", "").casefold() == "true":
            return True
        if tag.casefold() == "dialog" and "open" not in normalized:
            return True
        if normalized.get("id") in self._css_hidden_ids:
            return True
        if self._css_hidden_classes.intersection(
            normalized.get("class", "").split()
        ):
            return True
        style = normalized.get("style", "")
        return bool(_HIDDEN_STYLE_DECLARATION.search(style))

    def _closed_details_hides_text(self) -> bool:
        """Model native closed-details visibility without a browser renderer."""

        nearest_closed = next(
            (
                index
                for index in range(len(self._element_stack) - 1, -1, -1)
                if self._element_stack[index]["closed_details"]
            ),
            None,
        )
        if nearest_closed is None:
            return False
        return not any(
            entry["summary_passthrough"]
            for entry in self._element_stack[nearest_closed + 1 :]
        )

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        normalized_tag = tag.casefold()
        if normalized_tag in self._HTML_VOID_ELEMENTS:
            return
        normalized_attrs = {
            str(name).casefold(): "" if value is None else str(value).strip()
            for name, value in attrs
        }
        summary_passthrough = False
        if (
            normalized_tag == "summary"
            and self._element_stack
            and self._element_stack[-1]["closed_details"]
            and not self._element_stack[-1]["summary_seen"]
        ):
            self._element_stack[-1]["summary_seen"] = True
            summary_passthrough = True
        hidden = self._element_is_hidden(normalized_tag, attrs)
        self._element_stack.append(
            {
                "tag": normalized_tag,
                "hidden": hidden,
                "closed_details": (
                    normalized_tag == "details" and "open" not in normalized_attrs
                ),
                "summary_passthrough": summary_passthrough,
                "summary_seen": False,
            }
        )
        if hidden:
            self._hidden_depth += 1

    def handle_startendtag(
        self, tag: str, attrs: list[tuple[str, Optional[str]]]
    ) -> None:
        normalized_tag = tag.casefold()
        if normalized_tag in self._HTML_VOID_ELEMENTS:
            return
        # In HTML (unlike XML), the self-closing flag on non-void elements is
        # ignored. Treat ``<div hidden/>``, ``<template/>`` and ``<script/>``
        # exactly like opening tags so trailing content cannot become visible
        # in citations when a browser would keep it inside the element.
        self.handle_starttag(normalized_tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.casefold()
        matching_index = next(
            (
                index
                for index in range(len(self._element_stack) - 1, -1, -1)
                if self._element_stack[index]["tag"] == normalized_tag
            ),
            None,
        )
        if matching_index is None:
            return
        removed = self._element_stack[matching_index:]
        del self._element_stack[matching_index:]
        self._hidden_depth = max(
            0,
            self._hidden_depth
            - sum(1 for entry in removed if entry["hidden"]),
        )

    def handle_data(self, data: str) -> None:
        if (
            not self._hidden_depth
            and not self._closed_details_hides_text()
            and data.strip()
        ):
            self.parts.append(data)


def _normalized_document_text(value: str, *, is_html: bool) -> str:
    if is_html:
        hidden_classes, hidden_ids = _css_hidden_selectors_from_html(value)
        parser = _VisibleTextParser(
            css_hidden_classes=hidden_classes,
            css_hidden_ids=hidden_ids,
        )
        parser.feed(value)
        value = " ".join(parser.parts)
    return " ".join(value.split())[:_MAX_RETAINED_AUTHORITY_TEXT]


def _css_hidden_selectors_from_html(
    value: str,
) -> tuple[frozenset[str], frozenset[str]]:
    classes: set[str] = set()
    ids: set[str] = set()
    for style in re.finditer(
        r"<style\b[^>]*>(?P<body>.*?)</style>",
        str(value or "")[:2_000_000],
        re.IGNORECASE | re.DOTALL,
    ):
        css = style.group("body")[:100_000]
        for match in re.finditer(
            r"(?P<kind>[.#])(?P<name>[A-Za-z_][A-Za-z0-9_-]{0,80})"
            r"\s*\{(?P<body>[^{}]{0,2000})\}",
            css,
            re.DOTALL,
        ):
            if not _HIDDEN_STYLE_DECLARATION.search(match.group("body")):
                continue
            (classes if match.group("kind") == "." else ids).add(
                match.group("name")
            )
    return frozenset(classes), frozenset(ids)


def _microdata_property_value(node: Tag) -> str:
    """Apply the element-specific HTML microdata value algorithm."""

    tag = node.name.casefold()
    attribute = (
        "content"
        if tag == "meta"
        else "value"
        if tag in {"data", "meter"}
        else "href"
        if tag in {"a", "area", "link"}
        else "src"
        if tag in {"audio", "embed", "iframe", "img", "source", "track", "video"}
        else "datetime"
        if tag == "time"
        else None
    )
    if attribute:
        raw = node.attrs.get(attribute)
        return " ".join(html.unescape(str(raw or "")).split())
    return " ".join(node.get_text(" ", strip=True).split())


def _css_hidden_classes(soup: BeautifulSoup) -> frozenset[str]:
    """Recognize bounded simple class rules that unambiguously hide content."""

    classes: set[str] = set()
    for style in soup.find_all("style")[:32]:
        css = str(style.string or style.get_text(" ", strip=False))[:100_000]
        for match in re.finditer(
            r"(?P<kind>[.#])(?P<name>[A-Za-z_][A-Za-z0-9_-]{0,80})"
            r"\s*\{(?P<body>[^{}]{0,2000})\}",
            css,
            re.DOTALL,
        ):
            body = match.group("body")
            if _HIDDEN_STYLE_DECLARATION.search(body):
                prefix = "#" if match.group("kind") == "#" else ""
                classes.add(prefix + match.group("name"))
    return frozenset(classes)


def _dom_node_is_hidden(node: Tag, hidden_classes: frozenset[str]) -> bool:
    original = node
    current: Any = node
    while isinstance(current, Tag):
        tag = current.name.casefold()
        if tag in {"head", "script", "style", "noscript", "template"}:
            return True
        if tag == "dialog" and not current.has_attr("open"):
            return True
        if tag == "details" and not current.has_attr("open") and original is not current:
            first_summary = next(
                (
                    child
                    for child in current.find_all(recursive=False)
                    if isinstance(child, Tag) and child.name.casefold() == "summary"
                ),
                None,
            )
            if first_summary is None or not (
                original is first_summary or first_summary in original.parents
            ):
                return True
        attrs = current.attrs
        if "hidden" in attrs or str(attrs.get("aria-hidden") or "").casefold() == "true":
            return True
        style = str(attrs.get("style") or "")
        if _HIDDEN_STYLE_DECLARATION.search(style):
            return True
        raw_classes = attrs.get("class") or []
        classes = raw_classes if isinstance(raw_classes, list) else str(raw_classes).split()
        if hidden_classes.intersection(str(value) for value in classes):
            return True
        if f"#{str(attrs.get('id') or '')}" in hidden_classes:
            return True
        current = current.parent
    return False


def _visible_dom_text(node: Tag, hidden_classes: frozenset[str]) -> str:
    parts: list[str] = []
    for descendant in node.descendants:
        if not isinstance(descendant, NavigableString):
            continue
        parent = descendant.parent
        if not isinstance(parent, Tag) or _dom_node_is_hidden(parent, hidden_classes):
            continue
        if str(descendant).strip():
            parts.append(str(descendant))
    return " ".join(" ".join(parts).split())


def _visible_dom_projection(
    node: Tag, hidden_classes: frozenset[str]
) -> tuple[str, dict[int, tuple[int, int]]]:
    """Flatten visible DOM text and retain exact element-relative offsets."""

    parts: list[str] = []
    spans: dict[int, tuple[int, int]] = {}
    offset = 0
    for descendant in node.descendants:
        if not isinstance(descendant, NavigableString):
            continue
        parent = descendant.parent
        if not isinstance(parent, Tag) or _dom_node_is_hidden(parent, hidden_classes):
            continue
        value = " ".join(str(descendant).split())
        if not value:
            continue
        if parts:
            offset += 1
        start = offset
        parts.append(value)
        offset += len(value)
        current: Any = parent
        while isinstance(current, Tag):
            existing = spans.get(id(current))
            spans[id(current)] = (
                min(existing[0], start) if existing else start,
                max(existing[1], offset) if existing else offset,
            )
            if current is node:
                break
            current = current.parent
    return " ".join(parts), spans


def _dom_semantic_attribute_tokens(
    node: Tag, *attribute_names: str
) -> frozenset[str]:
    """Return exact semantic tokens from bounded DOM role attributes.

    Storefronts commonly encode a role as ``product-pricing__price`` or
    ``product-card-price``.  Regex word boundaries cannot safely recognize the
    underscore form because ``_`` is a word character.  Split only structural
    separators (plus camel-case boundaries) and require exact tokens so a
    substring such as ``pricey`` never becomes a price role.
    """

    values: list[str] = []
    for name in attribute_names:
        raw = node.get(name)
        if isinstance(raw, list):
            values.extend(str(value) for value in raw)
        elif raw is not None:
            values.append(str(raw))
    separated = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", " ".join(values))
    return frozenset(
        re.findall(r"[^\W_]+", separated.casefold(), re.UNICODE)
    )


def _commercial_offer_evidence(value: str) -> list[Dict[str, Any]]:
    """Extract bounded canonical Product/Offer fields from fetched raw HTML."""

    rows: list[Dict[str, Any]] = []
    seen_offers: set[tuple[str, str, str, str]] = set()
    poisoned_offer_ids: set[str] = set()
    poisoned_offer_name_descriptors: dict[
        str, set[tuple[str, str, str]]
    ] = {}
    poisoned_offer_keys: set[tuple[str, str, str, str]] = set()
    poisoned_offer_display_keys: set[tuple[str, str, str]] = set()
    poison_overflow = False
    scope_hints: dict[tuple[str, str, str, str], tuple[Tag, Tag]] = {}
    missing_availability = object()

    def normalized_price(raw: Any) -> str:
        # Schema.org price is a machine numeric value, not locale-formatted
        # display text. Accept canonical dot decimals and a single comma with
        # one/two fractional digits; reject grouping/localized ambiguity.
        candidate = "".join(str(raw or "").split())
        if re.fullmatch(r"-?\d+,\d{1,2}", candidate):
            candidate = candidate.replace(",", ".")
        if not re.fullmatch(r"-?\d+(?:\.\d+)?", candidate):
            return ""
        try:
            return format(Decimal(candidate), "f")
        except (InvalidOperation, ValueError):
            return ""

    def canonical_offer_product_id(raw: Any) -> str:
        normalized = unicodedata.normalize(
            "NFKC", " ".join(str(raw or "").split())
        ).casefold()
        return "".join(
            character
            for character in normalized
            if unicodedata.category(character) != "Cf"
        )[:300]

    def canonical_offer_product_name(raw: Any) -> str:
        normalized = unicodedata.normalize(
            "NFKC", " ".join(str(raw or "").split())
        ).casefold()
        return "".join(
            character
            for character in normalized
            if unicodedata.category(character) != "Cf"
        )[:300]

    def append_offer(
        *,
        signal_type: str,
        product_id: Any,
        product_name: Any,
        price: Any,
        price_currency: Any,
        availability: Any = missing_availability,
        scope_node: Optional[Tag] = None,
        offer_node: Optional[Tag] = None,
    ) -> None:
        nonlocal poison_overflow
        if poison_overflow:
            return
        identity = " ".join(str(product_id or "").split())[:300]
        canonical_identity = canonical_offer_product_id(identity)
        name = " ".join(str(product_name or "").split())[:300]
        canonical_name = canonical_offer_product_name(name)
        normalized_value = normalized_price(price)
        currency = str(price_currency or "").strip().upper()
        semantic_key = (
            name.casefold(),
            identity.casefold(),
            normalized_value,
            currency,
        )
        availability_is_explicit = availability is not missing_availability
        availability_text = (
            " ".join(str(availability).split())[:200]
            if availability_is_explicit
            else ""
        )
        availability_is_invalid = bool(
            availability_is_explicit
            and (
                not isinstance(availability, str)
                or not availability_text
                or _canonical_offer_availability(
                    availability_text,
                    signal_type=signal_type,
                )
                is None
            )
        )
        if availability_is_invalid:
            if canonical_identity:
                if (
                    canonical_identity not in poisoned_offer_ids
                    and len(poisoned_offer_ids) >= 64
                ):
                    poison_overflow = True
                else:
                    poisoned_offer_ids.add(canonical_identity)
            if canonical_name:
                descriptor = (
                    canonical_identity,
                    normalized_value,
                    currency,
                )
                name_descriptors = poisoned_offer_name_descriptors.get(
                    canonical_name
                )
                if (
                    descriptor not in (name_descriptors or set())
                    and sum(
                        len(values)
                        for values in poisoned_offer_name_descriptors.values()
                    )
                    >= 64
                ):
                    poison_overflow = True
                else:
                    poisoned_offer_name_descriptors.setdefault(
                        canonical_name, set()
                    ).add(descriptor)
            if (
                name
                and normalized_value
                and re.fullmatch(r"[A-Z]{3}", currency)
            ):
                display_key = (name.casefold(), normalized_value, currency)
                if (
                    display_key not in poisoned_offer_display_keys
                    and len(poisoned_offer_display_keys) >= 64
                ):
                    poison_overflow = True
                else:
                    poisoned_offer_keys.add(semantic_key)
                    poisoned_offer_display_keys.add(display_key)
            return
        if (
            not normalized_value
            or not re.fullmatch(r"[A-Z]{3}", currency)
            or not (identity or name)
        ):
            return
        # The same offer is commonly emitted as both JSON-LD and microdata.
        # Keep the first independently parsed representation so duplicate
        # markup cannot look like independent price corroboration.
        if len(rows) >= 24:
            return
        if semantic_key in seen_offers:
            if scope_node is not None and offer_node is not None:
                scope_hints[semantic_key] = (scope_node, offer_node)
            return
        canonical = {
            "signal_type": signal_type,
            "product_id": identity,
            "product_name": name,
            "price": normalized_value,
            "price_currency": currency,
            "availability": availability_text,
        }
        canonical["sha256"] = hashlib.sha256(
            _canonical_bytes(canonical)
        ).hexdigest()
        rows.append(canonical)
        seen_offers.add(semantic_key)
        if scope_node is not None and offer_node is not None:
            scope_hints[semantic_key] = (scope_node, offer_node)

    def walk(node: Any) -> Iterable[Mapping[str, Any]]:
        if isinstance(node, Mapping):
            yield node
            for child in node.values():
                yield from walk(child)
        elif isinstance(node, list):
            for child in node:
                yield from walk(child)

    scripts = re.finditer(
        r"<script[^>]+type=[\"']application/ld\+json[\"'][^>]*>"
        r"(?P<body>.*?)</script>",
        value,
        re.IGNORECASE | re.DOTALL,
    )
    for script in scripts:
        try:
            payload = json.loads(html.unescape(script.group("body")))
        except (json.JSONDecodeError, TypeError):
            continue
        for product in walk(payload):
            kinds = product.get("@type")
            if isinstance(kinds, str):
                kinds = [kinds]
            if not any(
                str(kind).rstrip("/").rsplit("/", 1)[-1].casefold()
                == "product"
                for kind in kinds or []
            ):
                continue
            offers = product.get("offers")
            offer_rows = offers if isinstance(offers, list) else [offers]
            for offer in offer_rows:
                if not isinstance(offer, Mapping):
                    continue
                append_offer(
                    signal_type="schema_org_product_offer",
                    product_id=(
                        product.get("sku")
                        or product.get("gtin13")
                        or product.get("gtin")
                        or product.get("mpn")
                        or ""
                    ),
                    product_name=product.get("name"),
                    price=offer.get("price"),
                    price_currency=offer.get("priceCurrency"),
                    availability=(
                        offer.get("availability")
                        if "availability" in offer
                        else missing_availability
                    ),
                )

    # Older storefronts often expose schema.org Product/Offer as HTML
    # microdata rather than JSON-LD. Parse only properties whose nearest typed
    # item scope is the same Product or nested Offer. This prevents a price or
    # identity from a neighbouring product card from completing another row.
    try:
        soup = BeautifulSoup(value, "html.parser")
    except (TypeError, ValueError):
        soup = None

    if soup is not None:
        def attribute_tokens(node: Any, name: str) -> tuple[str, ...]:
            raw = node.attrs.get(name) if getattr(node, "attrs", None) else None
            if isinstance(raw, (list, tuple)):
                values = raw
            else:
                values = str(raw or "").split()
            return tuple(str(item).strip() for item in values if str(item).strip())

        def has_schema_type(node: Any, expected: str) -> bool:
            return any(
                re.fullmatch(
                    rf"https?://schema\.org/{re.escape(expected)}/?",
                    token,
                    re.IGNORECASE,
                )
                is not None
                for token in attribute_tokens(node, "itemtype")
            )

        def nearest_typed_scope(node: Any) -> Any:
            parent = getattr(node, "parent", None)
            while parent is not None:
                if (
                    getattr(parent, "attrs", None)
                    and parent.has_attr("itemscope")
                    and attribute_tokens(parent, "itemtype")
                ):
                    return parent
                parent = getattr(parent, "parent", None)
            return None

        def property_value(scope: Any, *property_names: str) -> str:
            wanted = {name.casefold() for name in property_names}
            for node in scope.find_all(attrs={"itemprop": True}):
                if nearest_typed_scope(node) is not scope:
                    continue
                properties = {
                    token.casefold()
                    for token in attribute_tokens(node, "itemprop")
                }
                if not wanted.intersection(properties):
                    continue
                value = _microdata_property_value(node)
                if value:
                    return value
            return ""

        def property_is_present(scope: Any, *property_names: str) -> bool:
            wanted = {name.casefold() for name in property_names}
            return any(
                nearest_typed_scope(node) is scope
                and bool(
                    wanted.intersection(
                        {
                            token.casefold()
                            for token in attribute_tokens(node, "itemprop")
                        }
                    )
                )
                for node in scope.find_all(attrs={"itemprop": True})
            )

        product_scopes = [
            node
            for node in soup.find_all(attrs={"itemscope": True})
            if has_schema_type(node, "Product")
        ]
        for product in product_scopes:
            product_name = property_value(product, "name")
            product_id = ""
            for identity_property in (
                "sku",
                "gtin13",
                "gtin14",
                "gtin12",
                "gtin8",
                "gtin",
                "mpn",
                "productid",
            ):
                product_id = property_value(product, identity_property)
                if product_id:
                    break
            for offer in product.find_all(attrs={"itemscope": True}):
                if (
                    nearest_typed_scope(offer) is not product
                    or not has_schema_type(offer, "Offer")
                    or "offers" not in {
                        token.casefold()
                        for token in attribute_tokens(offer, "itemprop")
                    }
                ):
                    continue
                append_offer(
                    signal_type="schema_org_product_offer",
                    product_id=product_id,
                    product_name=product_name,
                    price=property_value(offer, "price"),
                    price_currency=property_value(offer, "pricecurrency"),
                    availability=(
                        property_value(offer, "availability")
                        if property_is_present(offer, "availability")
                        else missing_availability
                    ),
                    scope_node=product,
                    offer_node=offer,
                )

    # Some first-party storefronts render product grids from an HTML-escaped
    # component config rather than JSON-LD.  Parse only explicit product rows
    # with an ID/name, numeric price, and currency carried by that same row.
    for attribute in re.finditer(
        r"\bdata-config=(?P<quote>[\"'])(?P<body>.*?)(?P=quote)",
        value,
        re.IGNORECASE | re.DOTALL,
    ):
        encoded = attribute.group("body")
        encoded_casefold = encoded.casefold()
        if "pricesimple" not in encoded_casefold and "issalable" not in encoded_casefold:
            continue
        try:
            payload = json.loads(html.unescape(encoded))
        except (json.JSONDecodeError, TypeError):
            continue
        products = payload.get("products") if isinstance(payload, Mapping) else None
        if not isinstance(products, list):
            continue
        for product in products:
            if not isinstance(product, Mapping):
                continue
            raw_price = product.get("priceSimple")
            try:
                price = format(Decimal(str(raw_price)), "f")
            except (InvalidOperation, ValueError):
                price = ""
            price_markup = html.unescape(str(product.get("price") or ""))
            _visible_price, currency = _visible_price_currency(price_markup)
            identity = str(product.get("sku") or product.get("id") or "").strip()
            name = " ".join(str(product.get("name") or "").split())[:300]
            actions = product.get("actions")
            availability: Any = missing_availability
            if isinstance(actions, Mapping) and "isSalable" in actions:
                availability = (
                    "in_stock"
                    if actions.get("isSalable") is True
                    else "merchant_not_salable"
                )
            append_offer(
                signal_type="merchant_product_config",
                product_id=identity,
                product_name=name,
                price=price,
                price_currency=currency,
                availability=availability,
            )
    if soup is None:
        return []
    if poison_overflow:
        return []

    # Merchant configs carry product rows but not a direct DOM pointer. Match
    # each row to the smallest visible product-like element/card containing
    # its exact preferred identity and advertised price. This keeps legacy
    # storefront support subject to the same visible binding as JSON-LD.

    hidden_classes = _css_hidden_classes(soup)

    def structural_identifier_tokens(node: Tag) -> set[str]:
        raw_classes = node.get("class") or []
        values = (
            [str(value) for value in raw_classes]
            if isinstance(raw_classes, list)
            else str(raw_classes).split()
        )
        values.extend(
            str(node.get(name) or "")
            for name in ("id", "data-component")
        )
        tokens: set[str] = set()
        for value in values:
            camel_separated = re.sub(
                r"(?<=[a-z0-9])(?=[A-Z])", "-", value
            )
            tokens.update(
                token
                for token in re.split(
                    r"[^a-z0-9]+", camel_separated.casefold()
                )
                if token
            )
        return tokens

    def exact_identity_occurs(identity: str, text: str) -> bool:
        return bool(
            identity
            and re.search(
                rf"(?<!\w){re.escape(identity)}(?!\w)",
                text,
                re.IGNORECASE,
            )
        )

    def matching_price_text(row: Mapping[str, Any], text: str) -> str:
        for match in _PRIMARY_MARKET_VALUE.finditer(text):
            visible_price, visible_currency = _visible_price_currency(match.group(0))
            try:
                prices_match = Decimal(str(row.get("price") or "")) == Decimal(
                    visible_price
                )
            except InvalidOperation:
                prices_match = False
            if not prices_match:
                continue
            if visible_currency and visible_currency != row.get("price_currency"):
                continue
            return match.group(0)
        return ""

    def has_explicit_price_role(node: Tag, price_text: str) -> bool:
        own_text = _visible_dom_text(node, hidden_classes)
        if not own_text or price_text not in own_text:
            return False
        # Inspect only this local price element, not an arbitrary ancestor.
        # A bare amount is allowed when the element has an explicit product
        # price role/class/itemprop; prose amounts require a current/available
        # price label and reject historical/logistics roles.
        role_tokens = _dom_semantic_attribute_tokens(
            node,
            "itemprop",
            "class",
            "id",
            "aria-label",
            "data-testid",
            "data-component",
        )
        attrs_text = " ".join(sorted(role_tokens))
        role_text = " ".join((attrs_text, own_text))
        if _NON_OFFER_PRICE_ROLE.search(attrs_text):
            return False
        for negative in _NON_OFFER_PRICE_ROLE.finditer(own_text):
            for amount in _PRIMARY_MARKET_VALUE.finditer(own_text):
                if (
                    amount.group(0) == price_text
                    and abs(negative.start() - amount.start()) <= 40
                ):
                    return False
        explicit_role = bool(
            bool({"price", "lowprice", "highprice"}.intersection(role_tokens))
            or _CURRENT_PRICE_ROLE.search(own_text)
            or (
                node.has_attr("itemscope")
                and node.find(
                    attrs={
                        "itemprop": re.compile(r"(?:^|\s)price(?:\s|$)", re.I)
                    }
                )
                and node.find(
                    attrs={
                        "itemprop": re.compile(
                            r"(?:^|\s)priceCurrency(?:\s|$)", re.I
                        )
                    }
                )
            )
        )
        return explicit_role

    def visible_price_nodes(row: Mapping[str, Any], container: Tag) -> list[tuple[Tag, str]]:
        result: list[tuple[Tag, str]] = []
        nodes = [container, *container.find_all(True)]
        for node in nodes[:2_000]:
            if _dom_node_is_hidden(node, hidden_classes):
                continue
            # A price role belongs to the node carrying the amount, not an
            # ancestor which happens to aggregate an unrelated descendant.
            direct_text = " ".join(
                str(child).strip()
                for child in node.children
                if isinstance(child, NavigableString) and str(child).strip()
            )
            own_text = direct_text
            if not own_text:
                own_text = _visible_dom_text(node, hidden_classes)
                priced_children = [
                    child
                    for child in node.find_all(recursive=False)
                    if isinstance(child, Tag)
                    and _PRIMARY_MARKET_VALUE.search(
                        _visible_dom_text(child, hidden_classes)
                    )
                ]
                local_role_tokens = _dom_semantic_attribute_tokens(
                    node,
                    "class",
                    "id",
                    "itemprop",
                    "aria-label",
                    "data-testid",
                    "data-component",
                )
                local_attrs = " ".join(sorted(local_role_tokens))
                if (
                    not node.has_attr("itemscope")
                    and priced_children
                    and not (
                        len(priced_children) == 1
                        and {"price", "offer", "availability"}.intersection(
                            local_role_tokens
                        )
                        and not _NON_OFFER_PRICE_ROLE.search(local_attrs)
                    )
                ):
                    continue
            price_text = matching_price_text(row, own_text)
            if not price_text:
                continue
            negative_ancestor = next(
                (
                    ancestor
                    for ancestor in [node, *node.parents]
                    if isinstance(ancestor, Tag)
                    and ancestor is not container
                    and _NON_OFFER_PRICE_ROLE.search(
                        " ".join(
                            (
                                " ".join(
                                    sorted(
                                        _dom_semantic_attribute_tokens(
                                            ancestor,
                                            "class",
                                            "id",
                                            "aria-label",
                                            "data-testid",
                                            "data-component",
                                        )
                                    )
                                ),
                                " ".join(
                                    str(child).strip()
                                    for child in ancestor.children
                                    if isinstance(child, NavigableString)
                                    and str(child).strip()
                                ),
                            )
                        )
                    )
                ),
                None,
            )
            if negative_ancestor is not None:
                continue
            role_tokens = _dom_semantic_attribute_tokens(
                node,
                "class",
                "id",
                "itemprop",
                "aria-label",
                "data-testid",
                "data-component",
            )
            attrs_role = " ".join(sorted(role_tokens))
            semantic_container_role = bool(
                node.name.casefold() in {"div", "span", "p", "strong", "b", "em"}
                and _CURRENT_PRICE_ROLE.search(own_text)
                and not _NON_OFFER_PRICE_ROLE.search(attrs_role)
            )
            itemprop_price_role = bool(
                node.find(
                    attrs={
                        "itemprop": re.compile(r"(?:^|\s)price(?:\s|$)", re.I)
                    }
                )
                and node.find(
                    attrs={
                        "itemprop": re.compile(
                            r"(?:^|\s)priceCurrency(?:\s|$)", re.I
                        )
                    }
                )
            )
            if not (
                semantic_container_role
                or {"price", "offer", "availability"}.intersection(role_tokens)
                or itemprop_price_role
            ):
                continue
            if not has_explicit_price_role(node, price_text):
                continue
            # Prefer the smallest explicit price-role element. A parent whose
            # only role comes from a descendant is not independently eligible.
            result.append((node, price_text))
        result.sort(key=lambda item: len(_visible_dom_text(item[0], hidden_classes)))
        return result

    def visible_binding_for(
        row: Mapping[str, Any],
        *,
        conflicting_product_ids: frozenset[str] = frozenset(),
    ) -> Optional[Dict[str, Any]]:
        # A supplied human name is authoritative for visible identity. Do not
        # fall back to a visible SKU when a hidden JSON-LD name exists: that
        # would let an unrelated product card lend its price to the metadata.
        identity = " ".join(
            str(row.get("product_name") or row.get("product_id") or "").split()
        )
        if not identity:
            return None
        semantic_key = (
            str(row.get("product_name") or "").casefold(),
            str(row.get("product_id") or "").casefold(),
            str(row.get("price") or ""),
            str(row.get("price_currency") or ""),
        )
        candidates: list[tuple[int, int, Dict[str, Any]]] = []

        def scope_has_conflicting_product_id(
            container: Tag, scope_text: str
        ) -> bool:
            """Reject a locally visible ID for a conflicting offer status.

            A current row may be separated from a negative row with another
            strong ID only when its accepted atomic DOM scope identifies the
            current row exclusively.  Normalize the same way as structured
            product IDs and include accessible labels from that local scope,
            while deliberately excluding hidden nodes and the global page.
            """

            if not conflicting_product_ids:
                return False
            parts = [scope_text]
            retained_length = len(scope_text)
            descendants = container.find_all(True, limit=2_001)
            if len(descendants) > 2_000:
                return True
            for node in [container, *descendants]:
                if _dom_node_is_hidden(node, hidden_classes):
                    continue
                for attribute in ("aria-label", "title"):
                    raw = node.get(attribute)
                    if raw is None:
                        continue
                    value = " ".join(str(raw).split())
                    if not value:
                        continue
                    retained_length += len(value) + 1
                    if retained_length > 12_000:
                        return True
                    parts.append(value)
            # Product-ID canonicalization is capped for persisted identities;
            # the accepted visible scope is separately bounded above, so do
            # not let that 300-character cap hide a later conflicting ID.
            canonical_scope = "".join(
                character
                for character in unicodedata.normalize(
                    "NFKC", " ".join(parts)
                ).casefold()
                if unicodedata.category(character) != "Cf"
            )
            return any(
                re.search(
                    rf"(?<![a-z0-9]){re.escape(product_id)}(?![a-z0-9])",
                    canonical_scope,
                )
                is not None
                for product_id in conflicting_product_ids
            )

        def closed_price_role_prefix(value: str) -> bool:
            """Accept only the versioned visible current-price label language."""

            normalized = " ".join(str(value or "").split())
            for exact in (
                identity,
                " ".join(str(row.get("product_id") or "").split()),
            ):
                if exact:
                    normalized = re.sub(
                        rf"(?<!\w){re.escape(exact)}(?!\w)",
                        " ",
                        normalized,
                        flags=re.IGNORECASE,
                    )
            # An unbound numeric/alphanumeric prefix can be another product's
            # SKU, pack size, or amount; it is never current-price role text.
            if re.search(r"\d", normalized):
                return False
            words = re.findall(r"[^\W\d_]+", normalized.casefold(), re.UNICODE)
            return all(
                word in _VISIBLE_CURRENT_PRICE_LABEL_TOKENS_V1 for word in words
            )

        def is_product_container(node: Tag) -> bool:
            raw_classes = node.get("class") or []
            classes = (
                [str(value).casefold() for value in raw_classes]
                if isinstance(raw_classes, list)
                else str(raw_classes).casefold().split()
            )
            identifiers = {
                *classes,
                str(node.get("id") or "").casefold(),
                str(node.get("data-component") or "").casefold(),
            }
            owner_role_tokens = {
                "layout",
                "page",
                "view",
                "wrapper",
                "detail",
                "card",
                "item",
                "container",
                "tile",
                "row",
                "summary",
                "info",
                "content",
                "shell",
                "root",
            }
            structural_tokens = structural_identifier_tokens(node)
            product_token = bool(
                structural_tokens == {"product"}
                or "product" in structural_tokens
                and bool(structural_tokens & owner_role_tokens)
                and not structural_tokens & {"price", "pricing"}
                or {"listing", "tile"} <= structural_tokens
                or str(node.get("data-component") or "").casefold()
                == "product"
                or str(node.get("role") or "").casefold() == "group"
                and str(node.get("aria-label") or "").casefold().strip()
                == "product"
            )
            return bool(
                product_token
                or identifiers.intersection(
                    {
                        "product",
                        "product-card",
                        "product_card",
                        "product-item",
                        "product_item",
                        "product-detail",
                        "product_detail",
                        "item-card",
                        "item_card",
                    }
                )
                or re.search(
                    r"https?://schema\.org/Product/?$",
                    str(node.get("itemtype") or ""),
                    re.IGNORECASE,
                )
            )

        def canonical_product_id(value: Any) -> str:
            normalized = unicodedata.normalize(
                "NFKC", " ".join(str(value or "").split())
            ).casefold()
            return "".join(
                character
                for character in normalized
                if unicodedata.category(character) != "Cf"
            )

        def explicit_product_data_ids(node: Tag) -> set[str]:
            values: set[str] = set()
            for attribute in ("data-product-sku", "data-product-id"):
                if normalized := canonical_product_id(node.get(attribute)):
                    values.add(normalized)
            return values

        def data_ids_are_current_or_ambiguous(
            data_ids: set[str], candidate_id: str
        ) -> bool:
            if not candidate_id or not re.fullmatch(r"[a-z0-9]+", candidate_id):
                return True
            if len(data_ids) != 1:
                return True
            [data_id] = data_ids
            if not re.fullmatch(r"[a-z0-9]+", data_id):
                return True
            return data_id == candidate_id

        def is_potential_offer_owner(node: Tag) -> bool:
            role = str(node.get("role") or "").casefold()
            test_id = str(node.get("data-testid") or "").casefold()
            return bool(
                is_product_container(node)
                or node.name.casefold() in {"article", "li"}
                or role in {"article", "listitem"}
                or test_id in {"product", "product-card"}
                or explicit_product_data_ids(node)
            )

        def is_candidate_offer_owner(node: Tag) -> bool:
            data_ids = explicit_product_data_ids(node)
            candidate_id = canonical_product_id(row.get("product_id"))
            if data_ids:
                return data_ids_are_current_or_ambiguous(data_ids, candidate_id)
            return is_potential_offer_owner(node)

        def is_independent_offer_boundary(node: Tag) -> bool:
            """Identify a nested card that may own a separate availability.

            Structural/card markers are useful current-offer owners, but no
            cue-only element may shield an unavailable label from the real
            outer product. Only one unambiguous explicit product identifier
            different from the current structured offer establishes an
            independent nested boundary. ID-less neighboring cards may
            conservatively veto the current offer.
            """

            candidate_id = canonical_product_id(row.get("product_id"))
            data_ids = explicit_product_data_ids(node)
            return bool(
                data_ids
                and not data_ids_are_current_or_ambiguous(
                    data_ids, candidate_id
                )
            )

        def contains_node(root: Tag, target: Tag) -> bool:
            return root is target or any(
                descendant is target for descendant in root.descendants
            )

        def product_owner_has_unavailable_cue(
            *,
            container: Tag,
            identity_node: Tag,
            price_node: Tag,
        ) -> bool:
            """Inspect bounded local product owners without crossing cards.

            A storefront may place availability beside a nested title/price
            card while JSON-LD claims ``InStock``. The smallest binding alone
            would omit that sibling. Inspect product-like ancestors, but assign
            each cue to its nearest nested product container so an unavailable
            neighboring card or a global footer cannot veto this offer.
            """

            owners: list[Tag] = []
            current: Any = container
            scanned_ancestors = 0
            while isinstance(current, Tag):
                if current.name.casefold() in {
                    "[document]",
                    "html",
                    "body",
                }:
                    break
                scanned_ancestors += 1
                if scanned_ancestors > 64:
                    return True
                if (
                    (
                        is_candidate_offer_owner(current)
                    )
                    and contains_node(current, identity_node)
                    and contains_node(current, price_node)
                ):
                    owners.append(current)
                current = current.parent

            for owner in owners:
                descendants = owner.find_all(True, limit=2_001)
                if len(descendants) > 2_000:
                    return True
                nodes = [owner, *descendants]
                matching_nodes = [
                    node
                    for node in nodes
                    if not _dom_node_is_hidden(node, hidden_classes)
                    and _VISIBLE_UNAVAILABLE_OFFER_V1.search(
                        _visible_dom_text(node, hidden_classes)
                    )
                ]
                matching_ids = {id(node) for node in matching_nodes}
                leaf_matches = [
                    node
                    for node in matching_nodes
                    if not any(
                        id(descendant) in matching_ids
                        for descendant in node.find_all(True)
                    )
                ]
                for cue_node in leaf_matches:
                    product_utility_context = next(
                        (
                            ancestor
                            for ancestor in [cue_node, *cue_node.parents]
                            if isinstance(ancestor, Tag)
                            and ancestor is not owner
                            and contains_node(owner, ancestor)
                            and (
                                (
                                    bool(
                                        structural_identifier_tokens(ancestor)
                                        & {"product", "products"}
                                    )
                                    and structural_identifier_tokens(ancestor)
                                    & {
                                        "carousel",
                                        "count",
                                        "filter",
                                        "grid",
                                        "list",
                                        "listing",
                                        "recommendation",
                                        "recommendations",
                                        "recommended",
                                    }
                                )
                                or {"listing", "grid"}
                                <= structural_identifier_tokens(ancestor)
                                or structural_identifier_tokens(ancestor)
                                & {"recommendation", "recommendations"}
                                or "copyproduct"
                                in structural_identifier_tokens(ancestor)
                            )
                            and not (
                                contains_node(ancestor, identity_node)
                                and contains_node(ancestor, price_node)
                            )
                        ),
                        None,
                    )
                    if product_utility_context is not None:
                        continue
                    cue_owner = next(
                        (
                            ancestor
                            for ancestor in [cue_node, *cue_node.parents]
                            if isinstance(ancestor, Tag)
                            and is_independent_offer_boundary(ancestor)
                            and (
                                ancestor is owner
                                or contains_node(owner, ancestor)
                            )
                        ),
                        None,
                    )
                    if cue_owner is None or cue_owner is owner:
                        return True
                    if contains_node(cue_owner, identity_node) and contains_node(
                        cue_owner, price_node
                    ):
                        return True
            return False

        def atomic_binding(
            *,
            container: Tag,
            identity_node: Optional[Tag],
            price_node: Tag,
            price_text: str,
        ) -> Optional[Dict[str, Any]]:
            scope_text, element_spans = _visible_dom_projection(
                container, hidden_classes
            )
            if not scope_text or len(scope_text) > 6_000:
                return None
            price_node_span = element_spans.get(id(price_node))
            if price_node_span is None:
                return None
            price_node_text = _visible_dom_text(price_node, hidden_classes)
            candidate_id = " ".join(str(row.get("product_id") or "").split())
            price_descendants = price_node.find_all(True)
            # Never accept after inspecting only a prefix of the relevant DOM.
            # Excessive element fan-out is an ambiguous price scope and fails
            # closed instead of hiding a competing identity past a scan cap.
            if len(price_descendants) > 2_000:
                return None
            for descendant in price_descendants:
                if _dom_node_is_hidden(descendant, hidden_classes):
                    continue
                descendant_text = _visible_dom_text(descendant, hidden_classes)
                attrs = descendant.attrs
                class_tokens = (
                    attrs.get("class")
                    if isinstance(attrs.get("class"), list)
                    else str(attrs.get("class") or "").split()
                )
                marker_text = " ".join(
                    str(value)
                    for value in (
                        attrs.get("itemprop") or "",
                        attrs.get("id") or "",
                        *class_tokens,
                        attrs.get("role") or "",
                        attrs.get("data-component") or "",
                        attrs.get("data-testid") or "",
                        attrs.get("data-name") or "",
                    )
                )
                accessible_identity = " ".join(
                    str(attrs.get(name) or "").strip()
                    for name in ("aria-label", "title", "data-name")
                    if attrs.get(name)
                )
                identity_marked = bool(
                    descendant.name.casefold()
                    in {"h1", "h2", "h3", "h4", "h5", "h6"}
                    or str(attrs.get("role") or "").casefold() == "heading"
                    or
                    re.search(
                        r"(?:^|[\s_-])(?:name|title)(?:[\s_-]|$)|"
                        r"(?:product|item)[_-]?(?:card|name|title)|"
                        r"listing[_-]?tile",
                        marker_text,
                        re.IGNORECASE,
                    )
                )
                if identity_marked and not (
                    exact_identity_occurs(identity, descendant_text)
                    or candidate_id
                    and exact_identity_occurs(candidate_id, descendant_text)
                ):
                    return None
                if accessible_identity and not (
                    exact_identity_occurs(identity, accessible_identity)
                    or candidate_id
                    and exact_identity_occurs(candidate_id, accessible_identity)
                    or closed_price_role_prefix(accessible_identity)
                ):
                    return None
                if descendant.name.casefold() == "a" and not (
                    exact_identity_occurs(identity, descendant_text)
                    or candidate_id
                    and exact_identity_occurs(candidate_id, descendant_text)
                    or _PRIMARY_MARKET_VALUE.search(descendant_text)
                    and closed_price_role_prefix(
                        _PRIMARY_MARKET_VALUE.sub(" ", descendant_text)
                    )
                ):
                    return None
            local_price_occurrences = [
                (match.start(), match.end())
                for match in re.finditer(re.escape(price_text), price_node_text)
            ]
            if not local_price_occurrences:
                return None
            local_price_start, _local_price_end = local_price_occurrences[0]
            price_role_prefix = price_node_text[:local_price_start]
            if not closed_price_role_prefix(price_role_prefix):
                return None
            price_occurrences = [
                (match.start(), match.end())
                for match in re.finditer(re.escape(price_text), scope_text)
                if price_node_span[0] <= match.start()
                and match.end() <= price_node_span[1]
            ]
            if not price_occurrences:
                return None
            identity_span = (
                element_spans.get(id(identity_node))
                if isinstance(identity_node, Tag)
                else None
            ) or (0, len(scope_text))
            identity_occurrences = [
                (match.start(), match.end())
                for match in re.finditer(
                    rf"(?<!\w){re.escape(identity)}(?!\w)",
                    scope_text,
                    re.IGNORECASE,
                )
                if identity_span[0] <= match.start()
                and match.end() <= identity_span[1]
            ]
            if not identity_occurrences:
                return None
            identity_start, identity_end, price_start, price_end = min(
                [
                    (
                        identity_start,
                        identity_end,
                        price_start,
                        price_end,
                    )
                    for identity_start, identity_end in identity_occurrences
                    for price_start, price_end in price_occurrences
                ],
                key=lambda item: abs(item[0] - item[2]),
            )
            # Include the accepted local price-role element so the signed
            # claim retains labels such as "current price". The interval must
            # contain exactly the one accepted monetary occurrence; otherwise
            # an equal delivery/old/cart amount could later be substituted.
            claim_start = min(identity_start, price_node_span[0])
            claim_end = max(identity_end, price_end)
            if not (16 <= claim_end - claim_start <= 480):
                return None
            claim_text = scope_text[claim_start:claim_end]
            value_matches = list(_PRIMARY_MARKET_VALUE.finditer(claim_text))
            relative_price_start = price_start - claim_start
            relative_price_end = price_end - claim_start
            if (
                len(value_matches) != 1
                or value_matches[0].span()
                != (relative_price_start, relative_price_end)
                or value_matches[0].group(0) != price_text
            ):
                return None
            return {
                "scope_text": scope_text,
                "claim_text": claim_text,
                "claim_start": claim_start,
                "claim_end": claim_end,
                "identity_start": identity_start,
                "identity_end": identity_end,
                "price_start": price_start,
                "price_end": price_end,
            }

        def price_branch_is_product_pure(
            *, identity_node: Tag, price_node: Tag, price_text: str
        ) -> bool:
            """Reject a nested card/group that lends another product's price.

            The exact identity and accepted price may have a common product
            container, while the price actually belongs to a nested sibling
            tile. Walk the whole price-side branch below their lowest common
            ancestor. The signed claim may end at the amount, but ownership
            checks must also see post-price titles and negative price roles.
            """

            identity_ancestors = {
                id(node): node
                for node in [identity_node, *identity_node.parents]
                if isinstance(node, Tag)
            }
            lca = next(
                (
                    node
                    for node in [price_node, *price_node.parents]
                    if isinstance(node, Tag) and id(node) in identity_ancestors
                ),
                None,
            )
            if not isinstance(lca, Tag):
                return False

            candidate_id = " ".join(str(row.get("product_id") or "").split())
            def role_only(value: str) -> bool:
                return closed_price_role_prefix(
                    _PRIMARY_MARKET_VALUE.sub(" ", value)
                )

            def semantic_group(node: Tag) -> bool:
                attrs = node.attrs
                classes = attrs.get("class") or []
                class_text = " ".join(
                    str(value)
                    for value in (
                        classes if isinstance(classes, list) else str(classes).split()
                    )
                )
                tokens = " ".join(
                    (
                        str(attrs.get("id") or ""),
                        class_text,
                        str(attrs.get("role") or ""),
                        str(attrs.get("data-component") or ""),
                    )
                )
                return bool(
                    node.name.casefold() in {"article", "aside", "li", "section"}
                    or str(attrs.get("role") or "").casefold()
                    in {"group", "listitem", "region"}
                    or re.search(
                        r"(?:^|[\s_-])(?:listing|tile|card|item)(?:[\s_-]|$)",
                        tokens,
                        re.IGNORECASE,
                    )
                )

            def group_has_competing_identity(node: Tag) -> bool:
                descendants = node.find_all(True)
                if len(descendants) > 2_000:
                    return True
                for descendant in descendants:
                    if _dom_node_is_hidden(descendant, hidden_classes):
                        continue
                    attrs = descendant.attrs
                    marker = bool(
                        descendant.name.casefold()
                        in {"h1", "h2", "h3", "h4", "h5", "h6"}
                        or str(attrs.get("role") or "").casefold() == "heading"
                        or re.search(
                            r"(?:^|[\s_-])(?:name|title)(?:[\s_-]|$)|"
                            r"(?:product|item)[_-]?(?:card|name|title)|"
                            r"listing[_-]?tile",
                            " ".join(
                                (
                                    str(attrs.get("itemprop") or ""),
                                    str(attrs.get("id") or ""),
                                    str(attrs.get("class") or ""),
                                    str(attrs.get("data-component") or ""),
                                    str(attrs.get("data-testid") or ""),
                                )
                            ),
                            re.IGNORECASE,
                        )
                    )
                    if not marker:
                        continue
                    text = _visible_dom_text(descendant, hidden_classes)
                    if not (
                        exact_identity_occurs(identity, text)
                        or candidate_id and exact_identity_occurs(candidate_id, text)
                    ):
                        return True
                return False

            descendant_on_path: Tag = price_node
            current: Any = price_node
            while isinstance(current, Tag) and current is not lca:
                if semantic_group(current):
                    group_text = _visible_dom_text(current, hidden_classes)
                    if not (
                        exact_identity_occurs(identity, group_text)
                        or candidate_id
                        and exact_identity_occurs(candidate_id, group_text)
                    ):
                        return False
                    if (
                        _NON_OFFER_PRICE_ROLE.search(group_text)
                        or group_has_competing_identity(current)
                    ):
                        return False
                accessible_label = " ".join(
                    str(current.get(name) or "").strip()
                    for name in ("aria-label", "title", "data-name")
                    if current.get(name)
                )
                if accessible_label and not role_only(accessible_label):
                    return False
                itemprop = str(current.get("itemprop") or "")
                if re.search(r"(?:^|\s)name(?:\s|$)", itemprop, re.I):
                    item_name = _visible_dom_text(current, hidden_classes)
                    if item_name and not exact_identity_occurs(identity, item_name):
                        return False
                if current is not price_node:
                    prefix_parts: list[str] = []
                    for child in current.children:
                        if child is descendant_on_path:
                            break
                        if isinstance(child, NavigableString):
                            if str(child).strip():
                                prefix_parts.append(str(child))
                        elif isinstance(child, Tag) and not _dom_node_is_hidden(
                            child, hidden_classes
                        ):
                            child_text = _visible_dom_text(child, hidden_classes)
                            if child_text:
                                prefix_parts.append(child_text)
                    if prefix_parts and not role_only(" ".join(prefix_parts)):
                        return False
                descendant_on_path = current
                current = current.parent
            return True

        def consider(
            container: Tag, priority: int, matched_identity_node: Optional[Tag]
        ) -> None:
            if (
                container.name.casefold()
                in {
                    "[document]",
                    "html",
                    "body",
                    "head",
                    "script",
                    "style",
                    "main",
                }
                or _dom_node_is_hidden(container, hidden_classes)
            ):
                return
            scope_text = _visible_dom_text(container, hidden_classes)
            if not scope_text or len(scope_text) > 6_000:
                return
            if scope_has_conflicting_product_id(container, scope_text):
                return
            if not exact_identity_occurs(identity, scope_text):
                return
            prices = visible_price_nodes(row, container)
            if not prices:
                return
            price_node, price_text = prices[0]
            exact_identity_nodes = [
                node
                for node in [container, *container.find_all(True)[:2_000]]
                if not _dom_node_is_hidden(node, hidden_classes)
                and exact_identity_occurs(
                    identity, _visible_dom_text(node, hidden_classes)
                )
            ]
            structural_identity_node = (
                min(
                    exact_identity_nodes,
                    key=lambda node: len(_visible_dom_text(node, hidden_classes)),
                )
                if exact_identity_nodes
                else matched_identity_node
            )
            if not isinstance(structural_identity_node, Tag) or not (
                price_branch_is_product_pure(
                    identity_node=structural_identity_node,
                    price_node=price_node,
                    price_text=price_text,
                )
            ):
                return
            if product_owner_has_unavailable_cue(
                container=container,
                identity_node=structural_identity_node,
                price_node=price_node,
            ):
                return
            nested_product_ancestor = next(
                (
                    ancestor
                    for ancestor in [price_node, *price_node.parents]
                    if isinstance(ancestor, Tag)
                    and ancestor is not container
                    and is_product_container(ancestor)
                ),
                None,
            )
            intervening_distinct_heading = next(
                (
                    ancestor
                    for ancestor in [price_node, *price_node.parents]
                    if isinstance(ancestor, Tag)
                    and ancestor is not container
                    and any(
                        heading_text
                        and not exact_identity_occurs(identity, heading_text)
                        for heading in ancestor.find_all(
                            ["h1", "h2", "h3", "h4", "h5", "h6"],
                            recursive=False,
                        )
                        if (
                            heading_text := _visible_dom_text(
                                heading, hidden_classes
                            )
                        )
                    )
                ),
                None,
            )
            if (
                nested_product_ancestor is not None
                and not exact_identity_occurs(
                    identity,
                    _visible_dom_text(nested_product_ancestor, hidden_classes),
                )
            ) or intervening_distinct_heading is not None:
                return
            visible_product_id = ""
            candidate_id = " ".join(str(row.get("product_id") or "").split())
            if candidate_id and exact_identity_occurs(candidate_id, scope_text):
                visible_product_id = candidate_id
            atomic = atomic_binding(
                container=container,
                identity_node=structural_identity_node,
                price_node=price_node,
                price_text=price_text,
            )
            if atomic is None:
                return
            atomic["price_text"] = price_text
            atomic["product_id_text"] = visible_product_id
            candidates.append((priority, len(scope_text), atomic))

        hinted = scope_hints.get(semantic_key)
        identity_node: Optional[Tag] = None
        if isinstance(hinted, tuple):
            # A typed microdata Product is the strongest same-product scope;
            # it may carry the visible category description needed to bind a
            # product whose heading says "Adult Cat" rather than "Cat food".
            product_scope, offer_scope = hinted
            product_text = _visible_dom_text(product_scope, hidden_classes)
            # The exact nested Offer subtree—not merely its parent Product—
            # must render the amount through a visible price-role element.
            # This prevents a neighbouring product/card with the same amount
            # from lending display text to hidden microdata metadata.
            prices = visible_price_nodes(row, offer_scope)
            if exact_identity_occurs(identity, product_text) and prices:
                price_node, price_text = prices[0]
                # Preserve a bounded Product context for exact topic/category
                # text, but bind the price to the nested Offer subtree.
                scope_text = product_text
                if scope_text and len(scope_text) <= 6_000:
                    if scope_has_conflicting_product_id(
                        product_scope, scope_text
                    ):
                        scope_text = ""
                if scope_text and len(scope_text) <= 6_000:
                    identity_nodes = [
                        node
                        for node in product_scope.find_all(True)[:2_000]
                        if not _dom_node_is_hidden(node, hidden_classes)
                        and exact_identity_occurs(
                            identity, _visible_dom_text(node, hidden_classes)
                        )
                    ]
                    matched_identity_node = (
                        min(
                            identity_nodes,
                            key=lambda node: len(
                                _visible_dom_text(node, hidden_classes)
                            ),
                        )
                        if identity_nodes
                        else product_scope
                    )
                    visible_product_id = ""
                    candidate_id = " ".join(str(row.get("product_id") or "").split())
                    if candidate_id and exact_identity_occurs(candidate_id, scope_text):
                        visible_product_id = candidate_id
                    atomic = atomic_binding(
                        container=product_scope,
                        identity_node=matched_identity_node,
                        price_node=price_node,
                        price_text=price_text,
                    )
                    if atomic is not None:
                        atomic["price_text"] = price_text
                        atomic["product_id_text"] = visible_product_id
                        candidates.append((0, len(scope_text), atomic))
        if hinted is None:
            # JSON-LD has no DOM pointer. Start from an exact visible name node
            # and climb only through bounded product/card-like containers.
            # This rejects a global h1 and unrelated aside even when body/main
            # happen to contain both.
            for matched_identity_node in soup.find_all(True)[:20_000]:
                if _dom_node_is_hidden(matched_identity_node, hidden_classes):
                    continue
                identity_text = _visible_dom_text(
                    matched_identity_node, hidden_classes
                )
                if not exact_identity_occurs(identity, identity_text):
                    continue
                identity_node = matched_identity_node
                current: Any = matched_identity_node
                depth = 0
                while isinstance(current, Tag) and depth <= 4:
                    if current.name.casefold() in {
                        "[document]",
                        "html",
                        "body",
                        "main",
                    }:
                        break
                    product_like = is_product_container(current)
                    if depth == 0 and current.name.casefold() in {
                        "article",
                        "li",
                    }:
                        product_like = True
                    if depth == 0 and visible_price_nodes(row, current):
                        # A single element that itself renders the exact name,
                        # current-price label, and amount is already a bounded
                        # product row; no common-ancestor inference is needed.
                        product_like = True
                    if product_like:
                        consider(current, 1, matched_identity_node)
                    current = current.parent
                    depth += 1
        if not candidates:
            return None
        candidate_id = " ".join(str(row.get("product_id") or "").split())
        if candidate_id:
            id_bound = [
                candidate
                for candidate in candidates
                if candidate[2].get("product_id_text")
            ]
            if id_bound:
                candidates = id_bound
        _priority, _length, atomic = min(
            candidates, key=lambda candidate: (candidate[0], candidate[1])
        )
        binding: Dict[str, Any] = {
            "binding_version": "visible_product_offer_binding_v1",
            "identity_text": identity,
            **atomic,
        }
        binding["sha256"] = hashlib.sha256(_canonical_bytes(binding)).hexdigest()
        return binding

    bound_rows: list[Dict[str, Any]] = []
    seen_bound_offers: set[tuple[str, str, str, str]] = set()
    for row in rows:
        row_key = (
            str(row.get("product_name") or "").casefold(),
            str(row.get("product_id") or "").casefold(),
            str(row.get("price") or ""),
            str(row.get("price_currency") or ""),
        )
        row_display_key = (
            str(row.get("product_name") or "").casefold(),
            str(row.get("price") or ""),
            str(row.get("price_currency") or ""),
        )
        row_product_id = canonical_offer_product_id(row.get("product_id"))
        if row_product_id and row_product_id in poisoned_offer_ids:
            continue
        if row_key in poisoned_offer_keys:
            continue
        name_conflicts = poisoned_offer_name_descriptors.get(
            canonical_offer_product_name(row.get("product_name")), set()
        )
        anonymous_name_conflict = any(
            not conflict_id
            for conflict_id, _conflict_value, _conflict_currency in name_conflicts
        )
        identified_display_conflict_ids = frozenset(
            conflict_id
            for conflict_id, conflict_value, conflict_currency in name_conflicts
            if conflict_id
            and conflict_id != row_product_id
            and (
                not conflict_value
                or not re.fullmatch(r"[A-Z]{3}", conflict_currency)
                or (
                    conflict_value == str(row.get("price") or "")
                    and conflict_currency
                    == str(row.get("price_currency") or "")
                )
            )
        )
        binding = visible_binding_for(
            row,
            conflicting_product_ids=identified_display_conflict_ids,
        )
        if binding is None:
            continue
        visibly_bound_id = canonical_offer_product_id(
            binding.get("product_id_text")
        )
        if (name_conflicts and not row_product_id) or anonymous_name_conflict or (
            identified_display_conflict_ids
            and not (
                row_product_id and visibly_bound_id == row_product_id
            )
        ):
            continue
        if (
            row_display_key in poisoned_offer_display_keys
            and not visibly_bound_id
        ):
            continue
        bound = {key: val for key, val in row.items() if key != "sha256"}
        bound["visible_binding"] = binding
        bound["sha256"] = hashlib.sha256(_canonical_bytes(bound)).hexdigest()
        semantic_key = (
            str(bound.get("product_name") or "").casefold(),
            str(bound.get("product_id") or "").casefold(),
            str(bound.get("price") or ""),
            str(bound.get("price_currency") or ""),
        )
        if semantic_key in seen_bound_offers:
            continue
        seen_bound_offers.add(semantic_key)
        bound_rows.append(bound)
    collision_groups: dict[tuple[str, str, str, str], list[Dict[str, Any]]] = {}
    for row in bound_rows:
        binding = row.get("visible_binding") or {}
        collision_groups.setdefault(
            (
                str(binding.get("scope_text") or ""),
                str(binding.get("identity_text") or ""),
                str(binding.get("price_text") or ""),
                str(row.get("price_currency") or ""),
            ),
            [],
        ).append(row)
    rejected_hashes = {
        str(row.get("sha256") or "")
        for group in collision_groups.values()
        if len({str(row.get("product_id") or "") for row in group}) > 1
        for row in group
        if not str((row.get("visible_binding") or {}).get("product_id_text") or "")
    }
    return [
        row for row in bound_rows if str(row.get("sha256") or "") not in rejected_hashes
    ]


def _structured_statistical_observations(value: str) -> list[Dict[str, str]]:
    """Extract positional table observations from fetched statistical HTML.

    A flattened visible-text table loses row/column identity.  Only raw HTML
    can safely bind a value to its series and period without nearest-value
    guessing.  A narrowly validated Eurostat JSON-stat response is also
    accepted because its dimension indexes bind every value to its official
    product, reporter, flow, indicator, and period labels.  The canonical
    observation is HMAC-bound with the exact fetched response in either case.
    """

    json_stat_observations = _eurostat_comext_json_stat_observations(value)
    if json_stat_observations is not None:
        return json_stat_observations

    def attrs_value(attrs: str, name: str) -> str:
        match = re.search(
            rf"\b{re.escape(name)}=[\"']([^\"']+)[\"']",
            attrs,
            re.IGNORECASE,
        )
        return html.unescape(match.group(1)).strip() if match else ""

    def period_end(period: str) -> str:
        text = " ".join(period.split())
        quarter = re.search(
            r"\b(?:q([1-4])|([1-4])(?:st|nd|rd|th)?\s+quarter)\D{0,12}(20\d{2})\b",
            text,
            re.IGNORECASE,
        )
        if quarter:
            number = int(quarter.group(1) or quarter.group(2))
            year = int(quarter.group(3))
            month = number * 3
            return datetime(
                year, month, calendar.monthrange(year, month)[1], tzinfo=timezone.utc
            ).isoformat()
        dated = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", text)
        if dated:
            return datetime(
                int(dated.group(1)), int(dated.group(2)), int(dated.group(3)),
                tzinfo=timezone.utc,
            ).isoformat()
        month_match = re.search(
            r"\b(january|february|march|april|may|june|july|august|"
            r"september|october|november|december)\s+(20\d{2})\b",
            text,
            re.IGNORECASE,
        )
        if month_match:
            month = datetime.strptime(month_match.group(1), "%B").month
            year = int(month_match.group(2))
            return datetime(
                year, month, calendar.monthrange(year, month)[1], tzinfo=timezone.utc
            ).isoformat()
        year = re.search(r"\b(20\d{2})\b", text)
        return (
            datetime(int(year.group(1)), 12, 31, tzinfo=timezone.utc).isoformat()
            if year
            else ""
        )

    def release_date(text: str) -> str:
        match = re.search(
            r"\b(?:last\s+updated|updated|posted\s+on|published(?:\s+on)?|"
            r"released\s+on)\D{0,30}(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})",
            text,
            re.IGNORECASE,
        )
        if not match:
            return ""
        try:
            return datetime(
                int(match.group(3)),
                datetime.strptime(match.group(2), "%B").month,
                int(match.group(1)),
                tzinfo=timezone.utc,
            ).isoformat()
        except ValueError:
            return ""

    observations: list[Dict[str, str]] = []
    table_pattern = re.compile(
        r"<(?P<tag>figure|table)\b(?P<attrs>[^>]*)>(?P<body>.*?)</(?P=tag)>",
        re.IGNORECASE | re.DOTALL,
    )
    for table in table_pattern.finditer(value):
        block = table.group(0)
        table_text = _normalized_document_text(block, is_html=True)
        title_match = re.search(
            r"<(?:figcaption|h[1-4])\b[^>]*>(?P<body>.*?)</(?:figcaption|h[1-4])>",
            block,
            re.IGNORECASE | re.DOTALL,
        )
        table_title = (
            _normalized_document_text(title_match.group("body"), is_html=True)
            if title_match
            else ""
        )
        published_at = release_date(table_text)
        table_uuid = attrs_value(table.group("attrs"), "data-uuid") or attrs_value(
            table.group("attrs"), "data-table-id"
        ) or attrs_value(table.group("attrs"), "id")
        dataset = re.search(
            r"andmed\.stat\.ee/[^\"'<>\s]*/([A-Za-z0-9_-]{3,})",
            block,
            re.IGNORECASE,
        )
        dataset_id = dataset.group(1) if dataset else ""
        header_matches = list(
            re.finditer(
                r"<th\b(?P<attrs>[^>]*)>(?P<body>.*?)</th>",
                block,
                re.IGNORECASE | re.DOTALL,
            )
        )
        series_headers = [
            {
                # Keep the visible header as the public series label so the
                # evaluator can bind it back to the signed normalized page.
                # Preserve the publisher's machine code separately.
                "series": _normalized_document_text(
                    match.group("body"), is_html=True
                ) or attrs_value(match.group("attrs"), "data-series-name"),
                "series_code": attrs_value(
                    match.group("attrs"), "data-series-name"
                ),
                "unit": attrs_value(match.group("attrs"), "data-series-unit"),
            }
            for match in header_matches
            if attrs_value(match.group("attrs"), "data-series-name")
        ]
        period_headers = [
            attrs_value(match.group("attrs"), "data-category")
            for match in header_matches
            if attrs_value(match.group("attrs"), "data-category")
        ]
        rows = list(
            re.finditer(
                r"<tr\b(?P<attrs>[^>]*)>(?P<body>.*?)</tr>",
                block,
                re.IGNORECASE | re.DOTALL,
            )
        )
        def append_observation(
            *, series: str, series_code: str = "", unit: str, period: str, cell: str,
            row_text: str, row_cells: list[str], column_index: int,
            orientation: str, series_labels: list[str], period_labels: list[str],
        ) -> None:
            observation_end = period_end(period)
            value_match = _PRIMARY_MARKET_VALUE.search(cell) or re.search(
                r"(?<!\w)-?\d(?:[\d\u00a0 ]|[.,](?=\d))*(?!\w)", cell
            )
            if not value_match or not series or not observation_end or not published_at:
                return
            # A release cannot authoritatively describe a period that has not
            # ended yet.  In particular, a heading such as "2026 million
            # euros" must never turn a partial current year into 31 December.
            if observation_end > published_at:
                return
            canonical = {
                "table_id": table_uuid,
                "dataset_id": dataset_id,
                "table_title": table_title,
                "series": series,
                "series_code": series_code,
                "unit": unit,
                "period": period,
                "observation_end": observation_end,
                "value": value_match.group(0).strip(),
                "published_at": published_at,
                "row_text": row_text,
                "row_cells": list(row_cells),
                "cell_text": cell,
                "column_index": str(column_index),
                "orientation": orientation,
                "series_labels": list(series_labels),
                "period_labels": list(period_labels),
            }
            canonical["observation_sha256"] = hashlib.sha256(
                _canonical_bytes(canonical)
            ).hexdigest()
            observations.append(canonical)

        for row in rows:
            period_match = re.search(
                r"data-category=[\"'](?P<period>[^\"']+)[\"']",
                row.group(0),
                re.IGNORECASE,
            )
            cells = [
                _normalized_document_text(match.group("body"), is_html=True)
                for match in re.finditer(
                    r"<td\b[^>]*>(?P<body>.*?)</td>",
                    row.group("body"),
                    re.IGNORECASE | re.DOTALL,
                )
            ]
            row_text = _normalized_document_text(row.group(0), is_html=True)
            series_match = re.search(
                r"<th\b(?P<attrs>[^>]*)>(?P<body>.*?)</th>",
                row.group("body"),
                re.IGNORECASE | re.DOTALL,
            )
            if period_match and series_headers and len(cells) == len(series_headers):
                period = _normalized_document_text(period_match.group("period"), is_html=False)
                column_series_labels = [
                    str(header.get("series") or "") for header in series_headers
                ]
                for column_index, (header, cell) in enumerate(
                    zip(series_headers, cells)
                ):
                    append_observation(
                        period=period,
                        cell=cell,
                        row_text=row_text,
                        row_cells=cells,
                        column_index=column_index,
                        orientation="column",
                        series_labels=column_series_labels,
                        period_labels=[],
                        **header,
                    )
            elif (
                series_match
                and attrs_value(series_match.group("attrs"), "data-series-name")
                and period_headers
                and len(cells) == len(period_headers)
            ):
                series_code = attrs_value(
                    series_match.group("attrs"), "data-series-name"
                )
                series = _normalized_document_text(
                    series_match.group("body"), is_html=True
                ) or series_code
                unit = attrs_value(series_match.group("attrs"), "data-series-unit")
                if not unit and "," in series:
                    unit = series.rsplit(",", 1)[-1].strip()
                for column_index, (period, cell) in enumerate(
                    zip(period_headers, cells)
                ):
                    append_observation(
                        series=series,
                        series_code=series_code,
                        unit=unit,
                        period=period,
                        cell=cell,
                        row_text=row_text,
                        row_cells=cells,
                        column_index=column_index,
                        orientation="row",
                        series_labels=[series],
                        period_labels=period_headers,
                    )
    # HTML tables are often oldest-first. Keep a bounded set from the latest
    # explicit period rather than truncating to the first historical rows.
    observations.sort(
        key=lambda row: str(row.get("observation_end") or ""), reverse=True
    )
    latest_by_series: Dict[tuple[str, str, str, str], Dict[str, str]] = {}
    for observation in observations:
        identity = (
            str(observation.get("table_id") or ""),
            str(observation.get("dataset_id") or ""),
            str(observation.get("series") or ""),
            str(observation.get("unit") or ""),
        )
        latest_by_series.setdefault(identity, observation)
    return list(latest_by_series.values())[:12]


def _eurostat_comext_json_stat_observations(
    value: str,
) -> Optional[list[Dict[str, str]]]:
    """Derive one latest completed Comext observation from exact JSON-stat.

    This is intentionally not a general JSON-stat interpreter.  It recognizes
    only Eurostat's annual, fully specified DS-045409 import-value response.
    Every non-time dimension must be a singleton, the response must contain at
    most three annual periods, and an observation is accepted only after its
    positional index is re-derived from the official dimension metadata.

    ``None`` means the payload is not this format, allowing the existing HTML
    table parser to run.  ``[]`` means it claimed to be this format but failed
    closed validation.
    """

    stripped = str(value or "").lstrip("\ufeff \t\r\n")
    if not stripped.startswith("{"):
        return None

    def reject_duplicate_keys(
        pairs: list[tuple[str, Any]],
    ) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for key, child in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = child
        return result

    try:
        payload = json.loads(stripped, object_pairs_hook=reject_duplicate_keys)
    except (json.JSONDecodeError, TypeError, ValueError):
        return []
    if not isinstance(payload, Mapping):
        return []
    if not (
        payload.get("version") == "2.0"
        and payload.get("class") == "dataset"
        and payload.get("source") == "ESTAT"
        and isinstance(payload.get("label"), str)
        and "trade" in str(payload.get("label") or "").casefold()
        and "hs2-4-6" in str(payload.get("label") or "").casefold()
        and payload.get("id")
        == [
            "freq",
            "reporter",
            "partner",
            "product",
            "flow",
            "indicators",
            "time",
        ]
    ):
        return []

    sizes = payload.get("size")
    dimensions = payload.get("dimension")
    values = payload.get("value")
    extension = payload.get("extension")
    if not (
        isinstance(sizes, list)
        and len(sizes) == 7
        and all(type(size) is int for size in sizes)
        and sizes[:6] == [1, 1, 1, 1, 1, 1]
        and 1 <= sizes[6] <= 3
        and isinstance(dimensions, Mapping)
        and set(dimensions) == set(payload["id"])
        and isinstance(values, Mapping)
        and 1 <= len(values) <= 3
        and isinstance(extension, Mapping)
        and extension.get("id") == "DS-045409"
        and extension.get("agencyId") == "ESTAT"
    ):
        return []

    def singleton_dimension(name: str) -> tuple[str, str] | None:
        dimension = dimensions.get(name)
        category = (
            dimension.get("category")
            if isinstance(dimension, Mapping)
            else None
        )
        indexes = category.get("index") if isinstance(category, Mapping) else None
        labels = category.get("label") if isinstance(category, Mapping) else None
        if not (
            isinstance(indexes, Mapping)
            and len(indexes) == 1
            and isinstance(labels, Mapping)
        ):
            return None
        code, position = next(iter(indexes.items()))
        label = labels.get(code)
        if not (
            isinstance(code, str)
            and type(position) is int
            and position == 0
            and isinstance(label, str)
            and label.strip()
        ):
            return None
        return code, " ".join(label.split())

    freq = singleton_dimension("freq")
    reporter = singleton_dimension("reporter")
    partner = singleton_dimension("partner")
    product = singleton_dimension("product")
    flow = singleton_dimension("flow")
    indicator = singleton_dimension("indicators")
    if not all((freq, reporter, partner, product, flow, indicator)):
        return []
    assert freq and reporter and partner and product and flow and indicator
    if not (
        freq == ("A", "Annual")
        and re.fullmatch(r"[A-Z]{2}", reporter[0])
        and partner[0] == "WORLD"
        and re.search(r"\bworld\b", partner[1], re.IGNORECASE)
        and re.fullmatch(r"\d{6}|\d{8}", product[0])
        and flow[0] == "1"
        and flow[1].casefold() == "import"
        and indicator == ("VALUE_IN_EUROS", "VALUE_IN_EUROS")
    ):
        return []

    time_dimension = dimensions.get("time")
    time_category = (
        time_dimension.get("category")
        if isinstance(time_dimension, Mapping)
        else None
    )
    time_indexes = (
        time_category.get("index") if isinstance(time_category, Mapping) else None
    )
    time_labels = (
        time_category.get("label") if isinstance(time_category, Mapping) else None
    )
    expected_positions = set(range(sizes[6]))
    if not (
        isinstance(time_indexes, Mapping)
        and len(time_indexes) == sizes[6]
        and isinstance(time_labels, Mapping)
        and set(time_indexes.values()) == expected_positions
        and set(values).issubset({str(position) for position in expected_positions})
    ):
        return []

    try:
        published = datetime.fromisoformat(str(payload.get("updated") or ""))
    except ValueError:
        return []
    if published.tzinfo is None:
        return []
    published_utc = published.astimezone(timezone.utc)

    normalized_document = " ".join(str(value or "").split())
    # The pipeline's exact-claim field is capped at 2,000 characters.  Refuse
    # a response that cannot be retained byte-for-byte after visible-text
    # normalization rather than silently truncating its signed row identity.
    if not normalized_document or len(normalized_document) > 2_000:
        return []

    candidates: list[tuple[datetime, str, str, str]] = []
    for raw_period, raw_position in time_indexes.items():
        period = str(raw_period)
        if not (
            re.fullmatch(r"20\d{2}", period)
            and type(raw_position) is int
            and 0 <= raw_position < sizes[6]
            and time_labels.get(raw_period) == period
        ):
            return []
        raw_observation = values.get(str(raw_position))
        if raw_observation is None:
            continue
        if (
            isinstance(raw_observation, bool)
            or not isinstance(raw_observation, (int, float))
            or not math.isfinite(float(raw_observation))
            or raw_observation < 0
        ):
            return []
        if isinstance(raw_observation, float) and not raw_observation.is_integer():
            return []
        observation_value = str(int(raw_observation))
        observation_end = datetime(
            int(period), 12, 31, tzinfo=timezone.utc
        )
        # Annual data is complete only after the reported year has ended.  A
        # release timestamp early on 31 December must not make that year final.
        if int(period) < min(published.year, published_utc.year):
            candidates.append(
                (
                    observation_end,
                    period,
                    observation_value,
                    str(raw_position),
                )
            )
    if not candidates:
        return []
    observation_end, period, observation_value, value_position = max(candidates)
    if observation_value not in normalized_document or period not in normalized_document:
        return []

    series = (
        f"{product[1]}; annual import value into {reporter[1]} "
        f"from {partner[1]}"
    )
    canonical: Dict[str, Any] = {
        "table_id": "",
        "dataset_id": "DS-045409",
        "table_title": str(payload["label"]).strip(),
        "series": series,
        "series_code": f"{product[0]}:{flow[0]}:{indicator[0]}",
        "unit": "EUR",
        "period": period,
        "observation_end": observation_end.isoformat(),
        "value": observation_value,
        "published_at": published_utc.isoformat(),
        "row_text": normalized_document,
        "row_cells": [observation_value],
        "cell_text": observation_value,
        "column_index": "0",
        "orientation": "eurostat_jsonstat_time_dimension",
        "series_labels": [product[1], flow[1], reporter[1], partner[1]],
        "period_labels": [
            str(period_label)
            for period_label, position in sorted(
                time_indexes.items(), key=lambda item: int(item[1])
            )
            if str(position) in values
        ],
        "reporter_code": reporter[0],
        "reporter_label": reporter[1],
        "partner_code": partner[0],
        "partner_label": partner[1],
        "product_code": product[0],
        "product_label": product[1],
        "flow_code": flow[0],
        "flow_label": flow[1],
        "indicator_code": indicator[0],
        "value_position": value_position,
    }
    canonical_claim_text = _canonical_structured_statistical_claim_text(canonical)
    if not canonical_claim_text:
        return []
    # The exact raw JSON remains private and hash-bound on the source.  Public
    # observation metadata and claims retain only this deterministic display.
    canonical["row_text"] = canonical_claim_text
    canonical["canonical_claim_text"] = canonical_claim_text
    canonical["observation_sha256"] = hashlib.sha256(
        _canonical_bytes(canonical)
    ).hexdigest()
    return [canonical]


def _canonical_structured_statistical_claim_text(
    observation: Mapping[str, Any],
) -> str:
    """Render one bounded display strictly from raw-derived official fields."""

    if observation.get("dataset_id") != "DS-045409":
        return ""
    fields = {
        key: " ".join(str(observation.get(key) or "").split())
        for key in (
            "product_label",
            "product_code",
            "reporter_label",
            "partner_label",
            "value",
            "unit",
            "period",
        )
    }
    if not (
        all(fields.values())
        and re.fullmatch(r"\d{6}|\d{8}", fields["product_code"])
        and re.fullmatch(r"\d+", fields["value"])
        and fields["unit"] == "EUR"
        and re.fullmatch(r"20\d{2}", fields["period"])
    ):
        return ""
    rendered = (
        f"Eurostat DS-045409 reports the annual import value of "
        f"{fields['product_label']} (product {fields['product_code']}) into "
        f"{fields['reporter_label']} from {fields['partner_label']} as "
        f"{fields['value']} {fields['unit']} in {fields['period']}."
    )
    return rendered if len(rendered) <= 500 else ""


def _bound_structured_statistical_observations(
    supplied: Optional[list[Dict[str, str]]],
    *,
    direct_raw_html: Optional[str],
) -> tuple[list[Dict[str, str]], list[Dict[str, Any]], str]:
    """Re-derive signed table cells from the exact fetched raw document."""

    if not supplied and not direct_raw_html:
        return [], [], ""
    if not isinstance(direct_raw_html, str) or not direct_raw_html:
        raise ValueError("structured statistics require their fetched raw HTML")
    derived = _structured_statistical_observations(direct_raw_html)
    if supplied is not None and list(supplied) != derived:
        raise ValueError("structured statistics do not match fetched raw HTML")
    return (
        derived,
        [],
        hashlib.sha256(direct_raw_html.encode("utf-8")).hexdigest(),
    )


def _offer_payload_is_valid(row: Mapping[str, Any]) -> bool:
    unsigned = {str(key): value for key, value in row.items() if key != "sha256"}
    binding = row.get("visible_binding")
    scope_text = (
        str(binding.get("scope_text") or "")
        if isinstance(binding, Mapping)
        else ""
    )
    return bool(
        row.get("signal_type") in {
            "schema_org_product_offer",
            "merchant_product_config",
        }
        and (row.get("product_id") or row.get("product_name"))
        and re.fullmatch(r"-?\d+(?:\.\d+)?", str(row.get("price") or ""))
        and re.fullmatch(r"[A-Z]{3}", str(row.get("price_currency") or ""))
        and _canonical_offer_availability(
            row.get("availability"),
            signal_type=str(row.get("signal_type") or ""),
        )
        is not None
        and not _VISIBLE_UNAVAILABLE_OFFER_V1.search(scope_text)
        and _visible_offer_binding_is_valid(row)
        and hashlib.sha256(_canonical_bytes(unsigned)).hexdigest() == row.get("sha256")
    )


def _visible_price_currency(value: str) -> tuple[str, str]:
    number = re.search(
        r"-?(?:\d{1,3}(?:[ \u00a0,]\d{3})+(?:\.\d+)?|"
        r"\d{1,3}(?:[ \u00a0.]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)",
        value,
    )
    currency = re.search(rf"\b({_ISO_CURRENCY_CODES})\b", value, re.IGNORECASE)
    if currency:
        code = currency.group(1).upper()
    elif "€" in value:
        code = "EUR"
    elif "£" in value:
        code = "GBP"
    elif "$" in value:
        code = ""
    else:
        code = ""
    raw_number = "".join(number.group(0).split()) if number else ""
    if re.fullmatch(r"-?\d{1,3}(?:,\d{3})+(?:\.\d+)?", raw_number):
        raw_number = raw_number.replace(",", "")
    elif re.fullmatch(r"-?\d{1,3}(?:\.\d{3})+(?:,\d+)?", raw_number):
        raw_number = raw_number.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d+,\d{1,2}", raw_number):
        raw_number = raw_number.replace(",", ".")
    return (raw_number, code)


def _visible_offer_binding_is_valid(row: Mapping[str, Any]) -> bool:
    binding = row.get("visible_binding")
    if not isinstance(binding, Mapping):
        return False
    scope_text = " ".join(str(binding.get("scope_text") or "").split())
    identity_text = " ".join(str(binding.get("identity_text") or "").split())
    price_text = " ".join(str(binding.get("price_text") or "").split())
    claim_text = " ".join(str(binding.get("claim_text") or "").split())
    product_id_text = " ".join(
        str(binding.get("product_id_text") or "").split()
    )
    preferred_identity = " ".join(
        str(row.get("product_name") or row.get("product_id") or "").split()
    )
    unsigned_binding = {
        str(key): value for key, value in binding.items() if key != "sha256"
    }
    offsets = {
        key: binding.get(key)
        for key in (
            "claim_start",
            "claim_end",
            "identity_start",
            "identity_end",
            "price_start",
            "price_end",
        )
    }
    if (
        binding.get("binding_version") != "visible_product_offer_binding_v1"
        or
        not scope_text
        or len(scope_text) > 6_000
        or identity_text != preferred_identity
        or not price_text
        or not claim_text
        or any(
            isinstance(value, bool) or not isinstance(value, int)
            for value in offsets.values()
        )
        or not (
            0 <= offsets["claim_start"] < offsets["claim_end"] <= len(scope_text)
            and offsets["claim_start"]
            <= offsets["identity_start"]
            < offsets["identity_end"]
            <= offsets["claim_end"]
            and offsets["claim_start"]
            <= offsets["price_start"]
            < offsets["price_end"]
            <= offsets["claim_end"]
        )
        or scope_text[offsets["claim_start"] : offsets["claim_end"]]
        != claim_text
        or scope_text[offsets["identity_start"] : offsets["identity_end"]].casefold()
        != identity_text.casefold()
        or scope_text[offsets["price_start"] : offsets["price_end"]]
        != price_text
        or len(list(_PRIMARY_MARKET_VALUE.finditer(claim_text))) != 1
        or (
            product_id_text
            and (
                product_id_text != " ".join(str(row.get("product_id") or "").split())
                or not re.search(
                    rf"(?<!\w){re.escape(product_id_text)}(?!\w)",
                    scope_text,
                    re.IGNORECASE,
                )
            )
        )
        or not re.search(
            rf"(?<!\w){re.escape(identity_text)}(?!\w)",
            scope_text,
            re.IGNORECASE,
        )
        or hashlib.sha256(_canonical_bytes(unsigned_binding)).hexdigest()
        != binding.get("sha256")
    ):
        return False
    visible_price, visible_currency = _visible_price_currency(price_text)
    try:
        prices_match = Decimal(str(row.get("price") or "")) == Decimal(
            visible_price
        )
    except InvalidOperation:
        return False
    return bool(
        prices_match
        and (
            not visible_currency
            or visible_currency == str(row.get("price_currency") or "")
        )
        and _PRIMARY_MARKET_VALUE.fullmatch(price_text)
    )


def _matching_commercial_offer_evidence(
    rows: Any,
    *,
    visible_value: str,
    country_codes: Iterable[str] = (),
) -> Optional[Dict[str, str]]:
    if not isinstance(rows, list) or not rows:
        return None
    visible_price, visible_currency = _visible_price_currency(visible_value)
    explicit_currency = bool(visible_currency)
    ambiguous_symbol = bool(
        not explicit_currency
        and re.search(r"[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾]", visible_value)
    )
    candidates: list[Dict[str, str]] = []
    for row in rows[:24]:
        if not isinstance(row, Mapping):
            continue
        if _offer_payload_is_valid(row):
            offer_price = str(row.get("price") or "")
            offer_currency = str(row.get("price_currency") or "")
            try:
                prices_match = Decimal(offer_price) == Decimal(visible_price)
            except InvalidOperation:
                prices_match = False
            if prices_match and (
                (explicit_currency and offer_currency == visible_currency)
                or ambiguous_symbol
            ):
                candidates.append(dict(row))
    if explicit_currency:
        return candidates[0] if candidates else None
    # Currency symbols can be shared across countries.  Never infer a currency
    # from the symbol or country; accept only one exact price-matching currency
    # from raw-derived offers in a single jurisdiction-bound market cell.
    countries = {str(value).upper() for value in country_codes if value}
    currencies = {row.get("price_currency") for row in candidates}
    if len(countries) == 1 and len(currencies) == 1 and candidates:
        return candidates[0]
    return None


def _offer_identity_occurs_in_text(row: Mapping[str, Any], text: str) -> bool:
    normalized = " ".join(str(text or "").casefold().split())
    # Prefer the human product name whenever metadata supplies one. Falling
    # back to a visible SKU in that case would allow a hidden name to authorize
    # an unrelated priced card.
    token = " ".join(
        str(row.get("product_name") or row.get("product_id") or "")
        .casefold()
        .split()
    )
    return bool(
        token
        and re.search(
            rf"(?<!\w){re.escape(token)}(?!\w)",
            normalized,
            re.IGNORECASE,
        )
    )


def _claim_is_within_visible_offer_binding(
    row: Mapping[str, Any], claim_text: str
) -> bool:
    if not _visible_offer_binding_is_valid(row):
        return False
    binding = row["visible_binding"]
    normalized_claim = " ".join(str(claim_text or "").split())
    return bool(normalized_claim and normalized_claim == binding.get("claim_text"))


def _valid_commercial_offer_evidence(rows: Any) -> bool:
    if not isinstance(rows, list) or not 1 <= len(rows) <= 24:
        return False
    return all(
        isinstance(row, Mapping) and _offer_payload_is_valid(row)
        for row in rows
    )


def claim_matching_offer_evidence(
    proof: Mapping[str, Any], claim_text: str
) -> Optional[Dict[str, str]]:
    """Return the signed offer whose identity and price occur in an exact claim."""

    for offer in proof.get("commercial_offer_evidence") or []:
        if not isinstance(offer, Mapping) or not _offer_payload_is_valid(offer):
            continue
        if not _claim_is_within_visible_offer_binding(offer, claim_text):
            continue
        for visible in _PRIMARY_MARKET_VALUE.finditer(claim_text):
            matched = _matching_commercial_offer_evidence(
                [offer],
                visible_value=visible.group(0),
                country_codes=proof.get("country_codes") or [],
            )
            if matched:
                return matched
    return None


def fact_matching_offer_evidence(
    proof: Mapping[str, Any], claim_text: str, fact_value: str
) -> Optional[Dict[str, str]]:
    """Bind one extracted price fact to one signed Product/Offer.

    Claim-level matching is deliberately insufficient: a product card may also
    contain a cart subtotal, delivery threshold, or comparison value.  Only the
    individual value whose amount/currency matches the signed offer is allowed
    into the verified fact ledger.
    """

    for offer in proof.get("commercial_offer_evidence") or []:
        if (
            isinstance(offer, Mapping)
            and _offer_payload_is_valid(offer)
            and _claim_is_within_visible_offer_binding(offer, claim_text)
            and _matching_commercial_offer_evidence(
                [offer],
                visible_value=fact_value,
                country_codes=proof.get("country_codes") or [],
            )
        ):
            return dict(offer)
    return None


def _canonical_bytes(value: Mapping[str, Any]) -> bytes:
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return canonical.encode("utf-8")


def _signing_secret(explicit: Optional[str] = None) -> bytes:
    value = explicit or os.getenv("AXWISE_AUTHORITY_PROOF_SECRET")
    if not value or len(value.encode("utf-8")) < 32:
        raise RuntimeError(
            "AXWISE_AUTHORITY_PROOF_SECRET must contain at least 32 UTF-8 bytes"
        )
    return value.encode("utf-8")


def _proof_signature(payload: Mapping[str, Any], *, signing_secret: Optional[str] = None) -> str:
    return hmac.new(
        _signing_secret(signing_secret),
        _canonical_bytes(payload),
        hashlib.sha256,
    ).hexdigest()


def _host(url: str) -> str:
    return (urlparse(str(url or "")).hostname or "").casefold().rstrip(".")


def _country_code_from_url(url: str) -> Optional[str]:
    host = _host(url)
    suffix = host.rsplit(".", 1)[-1] if "." in host else ""
    if len(suffix) != 2:
        return None
    try:
        return str(pycountry.countries.lookup(suffix).alpha_2).upper()
    except LookupError:
        return None


def _jurisdiction_terms(country_codes: Iterable[str]) -> set[str]:
    terms: set[str] = set()
    for raw_code in country_codes:
        code = str(raw_code or "").strip().upper()
        if not code:
            continue
        try:
            country = pycountry.countries.lookup(code)
        except LookupError:
            continue
        for field in ("name", "official_name", "common_name"):
            value = getattr(country, field, None)
            if value:
                terms.add(str(value).casefold())
    return terms


def _document_binds_jurisdiction(
    *,
    final_url: str,
    text: str,
    country_codes: Iterable[str],
    market_terms: Iterable[str] = (),
) -> bool:
    """Prove that a fetched publisher page belongs to the requested market.

    A caller-supplied country code is policy input, not evidence.  It becomes
    proof only when the resolved publisher ccTLD matches, or the directly
    fetched document explicitly names the requested jurisdiction/locality.
    This also permits supranational official pages only when their text names
    the requested market.
    """

    requested = {str(value).upper() for value in country_codes if value}
    if not requested:
        return False
    url_code = _country_code_from_url(final_url)
    if url_code and url_code in requested:
        return True
    if url_code and url_code not in requested:
        return False
    normalized_text = " ".join(str(text or "").casefold().split())
    terms = _jurisdiction_terms(requested)
    terms.update(
        " ".join(str(value).casefold().split())
        for value in market_terms
        if len(" ".join(str(value).split())) >= 3
    )
    return any(
        re.search(rf"\b{re.escape(term)}\b", normalized_text)
        for term in terms
        if term
    )


def is_trusted_public_root(url: str) -> bool:
    host = _host(url)
    labels = host.split(".") if host else []
    return bool(
        host
        and (
            host.endswith(".gov")
            or (len(labels) >= 3 and labels[-2] == "gov" and len(labels[-1]) == 2)
            or host == "europa.eu"
            or host.endswith(".europa.eu")
        )
    )


def trusted_public_root_search_scope(country_codes: Iterable[str]) -> str:
    """Return bounded search scopes for recognized roots in a jurisdiction.

    This is discovery policy only. A returned result still has to be fetched,
    recognized by :func:`is_trusted_public_root`, bound to the requested
    jurisdiction, and contain an exact hostname reference before it can attest
    a direct publisher.
    """

    requested = {str(value).upper() for value in country_codes if value}
    scopes: list[str] = []
    if requested and requested.issubset(_EU_COUNTRY_CODES):
        scopes.append("site:europa.eu")
    if "US" in requested:
        scopes.append("site:gov")
    scopes.extend(
        f"site:gov.{code.casefold()}"
        for code in sorted(requested - _EU_COUNTRY_CODES - {"US"})
        if len(code) == 2
    )
    return " OR ".join(scopes) or "official government directory"


def authority_attestation_acquisition_hints(
    *,
    publisher_url: str,
    country_codes: Iterable[str],
) -> tuple[str, ...]:
    """Return bounded discovery hints for one exact country/publisher pair.

    This is deliberately only an acquisition registry.  Callers must fetch the
    returned URLs and pass their resulting documents through the normal
    authority enrichment and proof-validation path.  Multi-country requests,
    malformed URLs, subdomain/suffix lookalikes, and unregistered hosts fail
    closed with no hint.
    """

    requested = {
        str(value or "").strip().upper() for value in country_codes if value
    }
    try:
        parsed_publisher = urlparse(str(publisher_url or ""))
        publisher_port = parsed_publisher.port
    except ValueError:
        return ()
    publisher_host = (parsed_publisher.hostname or "").casefold().rstrip(".")
    if (
        len(requested) != 1
        or parsed_publisher.scheme.casefold() != "https"
        or not publisher_host
        or parsed_publisher.username
        or parsed_publisher.password
        or publisher_port not in {None, 443}
    ):
        return ()
    return _AUTHORITY_ATTESTATION_ACQUISITION_HINTS.get(
        (next(iter(requested)), publisher_host),
        (),
    )


def _recognized_root_covers_jurisdiction(
    url: str,
    country_codes: Iterable[str],
) -> bool:
    host = _host(url)
    requested = {str(value).upper() for value in country_codes if value}
    if not host or not requested:
        return False
    if host == "europa.eu" or host.endswith(".europa.eu"):
        return requested.issubset(_EU_COUNTRY_CODES)
    if host.endswith(".gov"):
        return requested == {"US"}
    labels = host.split(".")
    if len(labels) >= 3 and labels[-2] == "gov" and len(labels[-1]) == 2:
        return requested == {labels[-1].upper()}
    return False


def _host_reference_match(text: str, host: str) -> Optional[re.Match[str]]:
    value = str(text or "")
    normalized_host = host.casefold().rstrip(".")
    for url_match in re.finditer(r"https?://[^\s<>()\[\]{}]+", value, re.IGNORECASE):
        token = url_match.group(0).rstrip(".,;:!?'")
        if _host(token) == normalized_host:
            return url_match
    without_urls = re.sub(r"https?://[^\s<>()\[\]{}]+", " ", value, flags=re.IGNORECASE)
    return re.search(
        rf"(?<![a-z0-9.-]){re.escape(normalized_host)}(?=[\s,;:)\]\}}]|$)",
        without_urls,
        re.IGNORECASE,
    )


def _excerpt(
    text: str,
    needle: str,
    radius: int = 260,
    *,
    exact_host: bool = False,
) -> Dict[str, Any]:
    match = _host_reference_match(text, needle) if exact_host else None
    index = match.start() if match else text.casefold().find(needle.casefold())
    if index < 0 or (exact_host and match is None):
        raise ValueError("authority attestation does not reference the direct publisher")
    start = max(0, index - radius)
    end = min(len(text), index + len(needle) + radius)
    value = text[start:end]
    return {
        "text": value,
        "start": start,
        "end": end,
        "sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
    }


def build_attested_authority_proof(
    *,
    direct_url: str,
    direct_text: str,
    attestation_url: str,
    attestation_text: str,
    country_codes: Iterable[str],
    structured_statistical_observations: Optional[list[Dict[str, str]]] = None,
    direct_raw_html: Optional[str] = None,
    retrieved_at: Optional[str] = None,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a proof from two already-fetched, bounded HTTPS documents."""

    direct_host = _host(direct_url)
    attestation_host = _host(attestation_url)
    if not direct_host or urlparse(direct_url).scheme.casefold() != "https":
        raise ValueError("authority publisher must be a direct HTTPS URL")
    normalized_country_codes = sorted(
        {str(value).upper() for value in country_codes if value}
    )
    if not is_trusted_public_root(attestation_url):
        raise ValueError("authority attestation must come from a government/EU root")
    if not _recognized_root_covers_jurisdiction(
        attestation_url,
        normalized_country_codes,
    ):
        raise ValueError(
            "authority attestation root does not cover requested jurisdiction"
        )
    attestation_excerpt = _excerpt(
        attestation_text,
        direct_host,
        exact_host=True,
    )
    direct_match = _AUTHORITY_LANGUAGE.search(
        direct_text
    ) or _NAMED_STATISTICS_AUTHORITY.search(direct_text)
    if not direct_match and not (
        _AUTHORITY_LANGUAGE.search(attestation_excerpt["text"])
        or _NAMED_STATISTICS_AUTHORITY.search(attestation_excerpt["text"])
    ):
        raise ValueError("trusted attestation does not identify a public authority")
    direct_excerpt = (
        _excerpt(direct_text, direct_match.group(0))
        if direct_match
        else {
            "text": direct_text[:520],
            "start": 0,
            "end": min(520, len(direct_text)),
            "sha256": hashlib.sha256(direct_text[:520].encode("utf-8")).hexdigest(),
        }
    )
    observations, table_artifacts, structured_source_sha256 = (
        _bound_structured_statistical_observations(
            structured_statistical_observations,
            direct_raw_html=direct_raw_html,
        )
    )
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "independent_public_root_attestation",
        "source_authority": "official_public",
        "country_codes": normalized_country_codes,
        "direct": {
            "final_url": direct_url,
            "final_host": direct_host,
            "content_sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
            "excerpt": direct_excerpt,
        },
        "attestation": {
            "final_url": attestation_url,
            "final_host": attestation_host,
            "content_sha256": hashlib.sha256(
                attestation_text.encode("utf-8")
            ).hexdigest(),
            "excerpt": attestation_excerpt,
        },
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(),
        "structured_statistical_observations": observations,
        "structured_evidence_source_sha256": structured_source_sha256,
    }
    return {
        **payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(payload, signing_secret=signing_secret),
    }


def build_recognized_root_proof(
    *,
    direct_url: str,
    direct_text: str,
    country_codes: Iterable[str],
    structured_statistical_observations: Optional[list[Dict[str, str]]] = None,
    direct_raw_html: Optional[str] = None,
    retrieved_at: Optional[str] = None,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Bind a directly fetched government/EU root without trusting row labels."""

    if not is_trusted_public_root(direct_url):
        raise ValueError("direct source is not a recognized public root")
    country_codes = [str(value).upper() for value in country_codes if value]
    if not _recognized_root_covers_jurisdiction(direct_url, country_codes):
        raise ValueError("recognized public root does not cover requested jurisdiction")
    observations, table_artifacts, structured_source_sha256 = (
        _bound_structured_statistical_observations(
            structured_statistical_observations,
            direct_raw_html=direct_raw_html,
        )
    )
    if any(
        observation.get("reporter_code")
        and observation.get("reporter_code") not in set(country_codes)
        for observation in observations
    ):
        raise ValueError(
            "structured statistic reporter does not match requested jurisdiction"
        )
    structured_display = (
        str(observations[0].get("canonical_claim_text") or "")
        if len(observations) == 1
        else ""
    )
    excerpt_text = structured_display or direct_text[:520]
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "recognized_public_root_direct",
        "source_authority": "official_public",
        "country_codes": sorted(
            set(country_codes)
        ),
        "direct": {
            "final_url": direct_url,
            "final_host": _host(direct_url),
            "content_sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
            "excerpt": {
                "text": excerpt_text,
                "start": 0,
                "end": len(excerpt_text),
                "sha256": hashlib.sha256(excerpt_text.encode("utf-8")).hexdigest(),
                "representation": (
                    "raw_derived_structured_display"
                    if structured_display
                    else "direct_document_excerpt"
                ),
            },
        },
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(),
        "structured_statistical_observations": observations,
        "structured_evidence_source_sha256": structured_source_sha256,
    }
    return {
        **payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(payload, signing_secret=signing_secret),
    }


def build_direct_primary_market_proof(
    *,
    direct_url: str,
    direct_text: str,
    country_codes: Iterable[str],
    commercial_offer_evidence: Optional[list[Dict[str, Any]]] = None,
    direct_raw_html: Optional[str] = None,
    retrieved_at: Optional[str] = None,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Bind a directly fetched first-party catalogue/retailer observation.

    This proof does not claim that the publisher is a regulator or that an
    observed price generalizes to a whole market. It proves only that a dated,
    exact commercial observation appeared on the fetched HTTPS publisher page.
    """

    normalized_country_codes = sorted(
        {str(value).upper() for value in country_codes if value}
    )
    if len(normalized_country_codes) != 1:
        raise ValueError("primary market proof requires exactly one country cell")
    parsed = urlparse(str(direct_url or ""))
    host = _host(direct_url)
    if isinstance(direct_raw_html, str) and direct_raw_html:
        if _normalized_document_text(direct_raw_html, is_html=True) != direct_text:
            raise ValueError(
                "direct text does not match normalized fetched product HTML"
            )
    value_matches = list(_PRIMARY_MARKET_VALUE.finditer(direct_text))
    if parsed.scheme.casefold() != "https" or not host:
        raise ValueError("primary market publisher must be a direct HTTPS URL")
    jurisdiction_bound = _document_binds_jurisdiction(
        final_url=direct_url,
        text=direct_text,
        country_codes=normalized_country_codes,
    )
    if not jurisdiction_bound:
        raise ValueError("primary market page does not bind requested jurisdiction")
    if not value_matches:
        raise ValueError("direct page contains no explicit priced market observation")
    if commercial_offer_evidence or direct_raw_html:
        if not isinstance(direct_raw_html, str) or not direct_raw_html:
            raise ValueError("structured product offers require their fetched raw HTML")
        derived_offers = _commercial_offer_evidence(direct_raw_html)
        if (
            commercial_offer_evidence is not None
            and list(commercial_offer_evidence) != derived_offers
        ):
            raise ValueError("structured product offers do not match fetched raw HTML")
        commercial_offer_evidence = derived_offers
    matching_offers: list[Dict[str, Any]] = []
    seen_offer_hashes: set[str] = set()
    for candidate in commercial_offer_evidence or []:
        if not isinstance(candidate, Mapping) or not _offer_payload_is_valid(candidate):
            continue
        binding = candidate.get("visible_binding")
        if not isinstance(binding, Mapping):
            continue
        scope_text = " ".join(str(binding.get("scope_text") or "").split())
        # Each offer is authorized by its own raw-derived visible Product/card
        # scope. Iterating offers (instead of values) preserves two distinct
        # products that happen to have the same price.
        if not scope_text or scope_text not in direct_text:
            continue
        offer_hash = str(candidate.get("sha256") or "")
        if not offer_hash or offer_hash in seen_offer_hashes:
            continue
        matching_offers.append(dict(candidate))
        seen_offer_hashes.add(offer_hash)
        if len(matching_offers) >= 24:
            break
    # One ambiguous symbol may not authorize multiple raw currencies. The
    # document itself must disambiguate with an ISO code, otherwise the
    # Product/Offer set is not a unique visible observation.
    currencies_by_binding: dict[tuple[str, str], set[str]] = {}
    for offer in matching_offers:
        binding = offer.get("visible_binding") or {}
        price_text = str(binding.get("price_text") or "")
        _visible_amount, visible_currency = _visible_price_currency(price_text)
        if not visible_currency and re.search(
            r"[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾]", price_text
        ):
            key = (
                str(binding.get("scope_text") or ""),
                price_text,
            )
            currencies_by_binding.setdefault(key, set()).add(
                str(offer.get("price_currency") or "")
            )
    if any(len(currencies) > 1 for currencies in currencies_by_binding.values()):
        matching_offers = []
    if not matching_offers:
        raise ValueError("priced page contains no fetched structured Product/Offer evidence")
    first_binding = matching_offers[0]["visible_binding"]
    bound_scope = str(first_binding["scope_text"])
    scope_start = direct_text.find(bound_scope)
    excerpt_start = scope_start + int(first_binding["claim_start"])
    excerpt_end = scope_start + int(first_binding["claim_end"])
    excerpt_text = direct_text[excerpt_start:excerpt_end]
    if excerpt_text != first_binding.get("claim_text"):
        raise ValueError("signed offer claim span does not match direct document")
    direct_excerpt = {
        "text": excerpt_text,
        "start": excerpt_start,
        "end": excerpt_end,
        "sha256": hashlib.sha256(excerpt_text.encode("utf-8")).hexdigest(),
    }
    if not (
        _PRIMARY_MARKET_VALUE.search(direct_excerpt["text"])
        and matching_offers
    ):
        # The value and commercial label must occur in the same bounded proof
        # excerpt; a price elsewhere on a large page is not enough.
        raise ValueError("priced observation is not locally bound to the catalogue context")
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "direct_primary_market_observation",
        "source_authority": "first_party_catalog",
        "country_codes": normalized_country_codes,
        "jurisdiction_binding": {
            "status": "verified",
            "basis": (
                "resolved_publisher_cctld"
                if _country_code_from_url(direct_url) in normalized_country_codes
                else "direct_document_country_reference"
            ),
        },
        "direct": {
            "final_url": direct_url,
            "final_host": host,
            "content_sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
            "excerpt": direct_excerpt,
        },
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(),
        "commercial_offer_evidence": matching_offers,
        "structured_evidence_source_sha256": hashlib.sha256(
            str(direct_raw_html).encode("utf-8")
        ).hexdigest(),
    }
    return {
        **payload,
        "signature_alg": "hmac-sha256",
        "proof_signature": _proof_signature(payload, signing_secret=signing_secret),
    }


def validate_authority_proof(
    source: Mapping[str, Any],
    *,
    requested_country_codes: Iterable[str] = (),
    signing_secret: Optional[str] = None,
) -> bool:
    proof = source.get("authority_proof")
    if not isinstance(proof, Mapping):
        return False
    supplied_signature = str(proof.get("proof_signature") or "").casefold()
    payload = {
        key: value
        for key, value in proof.items()
        if key not in {"proof_signature", "signature_alg"}
    }
    try:
        expected_signature = _proof_signature(
            payload, signing_secret=signing_secret
        )
    except RuntimeError:
        return False
    if (
        proof.get("signature_alg") != "hmac-sha256"
        or not re.fullmatch(r"[a-f0-9]{64}", supplied_signature)
        or not hmac.compare_digest(expected_signature, supplied_signature)
    ):
        return False
    private_document = source.get("_authority_document_artifact")
    if not isinstance(private_document, Mapping):
        candidate_document = source.get("authority_document_artifact")
        private_document = (
            candidate_document
            if isinstance(candidate_document, Mapping)
            else None
        )
    if (
        isinstance(private_document, Mapping)
        and private_document.get("authority_proof_signature")
        != supplied_signature
    ):
        return False
    if proof.get("version") != AUTHORITY_PROOF_VERSION:
        return False
    direct = proof.get("direct")
    proof_type = str(proof.get("proof_type") or "")
    attestation = proof.get("attestation")
    if not isinstance(direct, Mapping):
        return False
    source_url = str(source.get("url") or "")
    if str(source_url).rstrip("/") != str(direct.get("final_url") or "").rstrip("/"):
        return False
    if _host(str(direct.get("final_url") or "")) != _host(source_url):
        return False
    direct_excerpt = direct.get("excerpt")
    if not isinstance(direct_excerpt, Mapping):
        return False
    excerpts = [direct_excerpt]
    requested = {str(value).upper() for value in requested_country_codes if value}
    proof_countries = {
        str(value).upper() for value in proof.get("country_codes") or [] if value
    }
    source_countries = {
        str(value).upper() for value in source.get("country_codes") or [] if value
    }
    expected_authority = "official_public"
    if proof_type == "independent_public_root_attestation":
        effective_countries = proof_countries | source_countries | requested
        attestation_url = str((attestation or {}).get("final_url") or "")
        if (
            not isinstance(attestation, Mapping)
            or not is_trusted_public_root(attestation_url)
            or not _recognized_root_covers_jurisdiction(
                attestation_url,
                effective_countries,
            )
        ):
            return False
        attestation_excerpt = attestation.get("excerpt")
        if not isinstance(attestation_excerpt, Mapping):
            return False
        excerpts.append(attestation_excerpt)
        if not _host_reference_match(
            str(attestation_excerpt.get("text") or ""),
            _host(source_url),
        ):
            return False
        if not (
            _AUTHORITY_LANGUAGE.search(str(direct_excerpt.get("text") or ""))
            or _NAMED_STATISTICS_AUTHORITY.search(str(direct_excerpt.get("text") or ""))
            or _AUTHORITY_LANGUAGE.search(str(attestation_excerpt.get("text") or ""))
            or _NAMED_STATISTICS_AUTHORITY.search(
                str(attestation_excerpt.get("text") or "")
            )
        ):
            return False
    elif proof_type == "recognized_public_root_direct":
        asserted_countries = proof_countries | source_countries
        if (
            not is_trusted_public_root(str(direct.get("final_url") or ""))
            or not _recognized_root_covers_jurisdiction(
                str(direct.get("final_url") or ""),
                asserted_countries,
            )
        ):
            return False
    elif proof_type == "direct_primary_market_observation":
        expected_authority = "first_party_catalog"
        direct_url = str(direct.get("final_url") or "")
        if (
            len(proof_countries) != 1
            or len(source_countries) != 1
            or (requested and len(requested) != 1)
            or proof_countries != source_countries
            or (requested and proof_countries != requested)
        ):
            return False
        if (
            urlparse(direct_url).scheme.casefold() != "https"
            or not _host(direct_url)
            or is_trusted_public_root(direct_url)
            or not _PRIMARY_MARKET_VALUE.search(
                str(direct_excerpt.get("text") or "")
            )
            or not _valid_commercial_offer_evidence(
                proof.get("commercial_offer_evidence")
            )
            or not re.fullmatch(
                r"[a-f0-9]{64}",
                str(proof.get("structured_evidence_source_sha256") or ""),
            )
            or proof.get("jurisdiction_binding", {}).get("status") != "verified"
        ):
            return False
        private_text = (
            private_document.get("text")
            if isinstance(private_document, Mapping)
            else None
        )
        private_raw_html = source.get("_structured_evidence_html")
        if (
            not isinstance(private_text, str)
            or not isinstance(private_raw_html, str)
            or not private_raw_html
            or len(private_raw_html.encode("utf-8")) > 2_000_000
            or hashlib.sha256(private_raw_html.encode("utf-8")).hexdigest()
            != proof.get("structured_evidence_source_sha256")
            or _normalized_document_text(private_raw_html, is_html=True)
            != private_text
            or not _document_binds_jurisdiction(
                final_url=direct_url,
                text=private_text,
                country_codes=proof_countries,
            )
        ):
            return False
    else:
        return False
    if proof.get("structured_statistical_observations") and not re.fullmatch(
        r"[a-f0-9]{64}",
        str(proof.get("structured_evidence_source_sha256") or ""),
    ):
        return False
    proof_observations = proof.get("structured_statistical_observations")
    if proof_observations is not None and not (
        isinstance(proof_observations, list)
        and len(proof_observations) <= 12
        and all(isinstance(row, Mapping) for row in proof_observations)
    ):
        return False
    if isinstance(proof_observations, list):
        # Before persistence, independently bind the signed manifest back to
        # the exact private fetch response. A caller able to create a fresh
        # proof HMAC still cannot replace a raw-derived value/series/product
        # while leaving the fetched JSON/HTML unchanged. After the deliberate
        # private-artifact scrub, signature-only validation remains available.
        nested_candidate = source.get("_direct_document_candidate")
        private_raw_values = [
            value
            for value in (
                source.get("_structured_evidence_html"),
                (
                    nested_candidate.get("_structured_evidence_html")
                    if isinstance(nested_candidate, Mapping)
                    else None
                ),
            )
            if isinstance(value, str) and value
        ]
        for private_raw in private_raw_values:
            if (
                hashlib.sha256(private_raw.encode("utf-8")).hexdigest()
                != proof.get("structured_evidence_source_sha256")
                or _structured_statistical_observations(private_raw)
                != proof_observations
            ):
                return False
    if any(
        isinstance(observation, Mapping)
        and observation.get("reporter_code")
        and (
            len(proof_countries) != 1
            or observation.get("reporter_code") not in proof_countries
        )
        for observation in proof_observations or []
    ):
        return False
    for excerpt in excerpts:
        text = excerpt.get("text")
        if not isinstance(text, str) or hashlib.sha256(text.encode("utf-8")).hexdigest() != excerpt.get("sha256"):
            return False
    return bool(
        proof.get("source_authority") == expected_authority
        and source.get("source_authority") == expected_authority
        and source.get("retrieved_at") == proof.get("retrieved_at")
        and (not requested or bool(requested & proof_countries & source_countries))
    )


def build_authority_claim_artifact(
    *,
    source_id: str,
    source_url: str,
    authority_proof: Mapping[str, Any],
    authority_document: Mapping[str, Any],
    claim_text: str,
    excerpt_radius: int = 420,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a bounded, signed exact-span artifact without publishing a page."""

    document_text = authority_document.get("text")
    if not isinstance(document_text, str) or not claim_text:
        raise ValueError("authority document/claim text is missing")
    document_start = document_text.find(claim_text)
    if document_start < 0:
        raise ValueError("claim does not occur in direct authority document")
    document_end = document_start + len(claim_text)
    excerpt_start = max(0, document_start - max(0, excerpt_radius))
    excerpt_end = min(len(document_text), document_end + max(0, excerpt_radius))
    excerpt_text = document_text[excerpt_start:excerpt_end]
    claim_start = document_start - excerpt_start
    claim_end = claim_start + len(claim_text)
    direct_hash = str((authority_proof.get("direct") or {}).get("content_sha256") or "")
    proof_signature = str(authority_proof.get("proof_signature") or "")
    retrieved_at = authority_proof.get("retrieved_at")
    if (
        hashlib.sha256(document_text.encode("utf-8")).hexdigest() != direct_hash
        or authority_document.get("sha256") != direct_hash
        or authority_document.get("authority_proof_signature") != proof_signature
        or authority_document.get("retrieved_at") != retrieved_at
    ):
        raise ValueError("authority document is not bound to its authority proof")
    payload = {
        "version": AUTHORITY_CLAIM_PROOF_VERSION,
        "source_id": source_id,
        "source_url": source_url,
        "authority_proof_signature": proof_signature,
        "direct_content_sha256": direct_hash,
        "retrieved_at": retrieved_at,
        "excerpt_sha256": hashlib.sha256(excerpt_text.encode("utf-8")).hexdigest(),
        "document_start": excerpt_start,
        "document_end": excerpt_end,
        "claim_start": claim_start,
        "claim_end": claim_end,
        "claim_text_sha256": hashlib.sha256(claim_text.encode("utf-8")).hexdigest(),
    }
    return {
        "artifact_type": "direct_authority_document",
        "source_id": source_id,
        "text": excerpt_text,
        "sha256": payload["excerpt_sha256"],
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof_signature,
        "direct_content_sha256": direct_hash,
        "claim_binding": {
            **payload,
            "signature_alg": "hmac-sha256",
            "claim_proof_signature": _proof_signature(
                payload, signing_secret=signing_secret
            ),
        },
    }


def build_structured_statistical_claim_artifact(
    *,
    source_id: str,
    source_url: str,
    authority_proof: Mapping[str, Any],
    authority_document: Mapping[str, Any],
    observation: Mapping[str, Any],
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Bind a raw-derived display claim to its signed structured observation."""

    document_text = authority_document.get("text")
    direct_hash = str((authority_proof.get("direct") or {}).get("content_sha256") or "")
    proof_signature = str(authority_proof.get("proof_signature") or "")
    retrieved_at = authority_proof.get("retrieved_at")
    canonical_text = _canonical_structured_statistical_claim_text(observation)
    observation_hash = str(observation.get("observation_sha256") or "")
    unsigned_observation = {
        str(key): value
        for key, value in observation.items()
        if key != "observation_sha256"
    }
    if (
        not isinstance(document_text, str)
        or not canonical_text
        or observation.get("canonical_claim_text") != canonical_text
        or hashlib.sha256(_canonical_bytes(unsigned_observation)).hexdigest()
        != observation_hash
        or observation not in (
            authority_proof.get("structured_statistical_observations") or []
        )
        or hashlib.sha256(document_text.encode("utf-8")).hexdigest() != direct_hash
        or authority_document.get("sha256") != direct_hash
        or authority_document.get("authority_proof_signature") != proof_signature
        or authority_document.get("retrieved_at") != retrieved_at
    ):
        raise ValueError("structured observation is not bound to authority proof")
    payload = {
        "version": AUTHORITY_STRUCTURED_CLAIM_PROOF_VERSION,
        "source_id": source_id,
        "source_url": source_url,
        "authority_proof_signature": proof_signature,
        "direct_content_sha256": direct_hash,
        "retrieved_at": retrieved_at,
        "structured_observation_sha256": observation_hash,
        "claim_text_sha256": hashlib.sha256(
            canonical_text.encode("utf-8")
        ).hexdigest(),
    }
    return {
        "artifact_type": "derived_structured_statistical_observation",
        "source_id": source_id,
        "text": canonical_text,
        "sha256": payload["claim_text_sha256"],
        "retrieved_at": retrieved_at,
        "authority_proof_signature": proof_signature,
        "direct_content_sha256": direct_hash,
        "structured_observation_sha256": observation_hash,
        "claim_binding": {
            **payload,
            "signature_alg": "hmac-sha256",
            "claim_proof_signature": _proof_signature(
                payload,
                signing_secret=signing_secret,
            ),
        },
    }


def validate_structured_statistical_claim_artifact(
    source: Mapping[str, Any],
    artifact: Mapping[str, Any],
    citation: Mapping[str, Any],
    claim_text: str,
    observation: Mapping[str, Any],
    *,
    signing_secret: Optional[str] = None,
) -> bool:
    """Validate a display claim without treating generated prose as a quote."""

    proof = source.get("authority_proof")
    binding = artifact.get("claim_binding")
    if not isinstance(proof, Mapping) or not isinstance(binding, Mapping):
        return False
    signature = str(binding.get("claim_proof_signature") or "").casefold()
    payload = {
        key: value
        for key, value in binding.items()
        if key not in {"claim_proof_signature", "signature_alg"}
    }
    try:
        expected_signature = _proof_signature(
            payload,
            signing_secret=signing_secret,
        )
    except RuntimeError:
        return False
    canonical_text = _canonical_structured_statistical_claim_text(observation)
    observation_hash = str(observation.get("observation_sha256") or "")
    unsigned_observation = {
        str(key): value
        for key, value in observation.items()
        if key != "observation_sha256"
    }
    proof_signature = str(proof.get("proof_signature") or "")
    direct_hash = str((proof.get("direct") or {}).get("content_sha256") or "")
    return bool(
        binding.get("version") == AUTHORITY_STRUCTURED_CLAIM_PROOF_VERSION
        and binding.get("signature_alg") == "hmac-sha256"
        and re.fullmatch(r"[a-f0-9]{64}", signature)
        and hmac.compare_digest(signature, expected_signature)
        and artifact.get("artifact_type")
        == "derived_structured_statistical_observation"
        and artifact.get("source_id") == source.get("source_id")
        and binding.get("source_id") == source.get("source_id")
        and str(binding.get("source_url") or "").rstrip("/")
        == str(source.get("url") or "").rstrip("/")
        and artifact.get("authority_proof_signature") == proof_signature
        and binding.get("authority_proof_signature") == proof_signature
        and artifact.get("direct_content_sha256") == direct_hash
        and binding.get("direct_content_sha256") == direct_hash
        and artifact.get("retrieved_at") == proof.get("retrieved_at")
        and binding.get("retrieved_at") == proof.get("retrieved_at")
        and source.get("retrieved_at") == proof.get("retrieved_at")
        and canonical_text
        and claim_text == canonical_text
        and artifact.get("text") == canonical_text
        and artifact.get("sha256")
        == hashlib.sha256(canonical_text.encode("utf-8")).hexdigest()
        and binding.get("claim_text_sha256") == artifact.get("sha256")
        and citation.get("span_target")
        == "derived_structured_statistical_observation"
        and citation.get("offset_unit") == "unicode_codepoints"
        and citation.get("segment_start") == 0
        and citation.get("segment_end") == len(canonical_text)
        and citation.get("source_id") == source.get("source_id")
        and hashlib.sha256(_canonical_bytes(unsigned_observation)).hexdigest()
        == observation_hash
        and observation.get("canonical_claim_text") == canonical_text
        and observation in (proof.get("structured_statistical_observations") or [])
        and artifact.get("structured_observation_sha256") == observation_hash
        and binding.get("structured_observation_sha256") == observation_hash
    )


def validate_authority_claim_artifact(
    source: Mapping[str, Any],
    artifact: Mapping[str, Any],
    citation: Mapping[str, Any],
    claim_text: str,
    *,
    signing_secret: Optional[str] = None,
) -> bool:
    proof = source.get("authority_proof")
    binding = artifact.get("claim_binding")
    if not isinstance(proof, Mapping) or not isinstance(binding, Mapping):
        return False
    signature = str(binding.get("claim_proof_signature") or "").casefold()
    payload = {
        key: value
        for key, value in binding.items()
        if key not in {"claim_proof_signature", "signature_alg"}
    }
    try:
        expected = _proof_signature(payload, signing_secret=signing_secret)
    except RuntimeError:
        return False
    text = artifact.get("text")
    start = citation.get("segment_start")
    end = citation.get("segment_end")
    proof_signature = str(proof.get("proof_signature") or "")
    direct_hash = str((proof.get("direct") or {}).get("content_sha256") or "")
    return bool(
        binding.get("version") == AUTHORITY_CLAIM_PROOF_VERSION
        and binding.get("signature_alg") == "hmac-sha256"
        and re.fullmatch(r"[a-f0-9]{64}", signature)
        and hmac.compare_digest(signature, expected)
        and artifact.get("artifact_type") == "direct_authority_document"
        and artifact.get("source_id") == source.get("source_id")
        and binding.get("source_id") == source.get("source_id")
        and str(binding.get("source_url") or "").rstrip("/")
        == str(source.get("url") or "").rstrip("/")
        and artifact.get("authority_proof_signature") == proof_signature
        and binding.get("authority_proof_signature") == proof_signature
        and artifact.get("direct_content_sha256") == direct_hash
        and binding.get("direct_content_sha256") == direct_hash
        and artifact.get("retrieved_at") == proof.get("retrieved_at")
        and binding.get("retrieved_at") == proof.get("retrieved_at")
        and source.get("retrieved_at") == proof.get("retrieved_at")
        and isinstance(text, str)
        and hashlib.sha256(text.encode("utf-8")).hexdigest() == artifact.get("sha256")
        and artifact.get("sha256") == binding.get("excerpt_sha256")
        and isinstance(start, int)
        and isinstance(end, int)
        and start == binding.get("claim_start")
        and end == binding.get("claim_end")
        and 0 <= start < end <= len(text)
        and text[start:end] == claim_text
        and hashlib.sha256(claim_text.encode("utf-8")).hexdigest()
        == binding.get("claim_text_sha256")
    )


async def _public_hostname(host: str) -> bool:
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_unspecified
        ):
            return False
    return bool(infos)


async def _run_authority_cpu(
    executor: ThreadPoolExecutor,
    function: Callable[..., Any],
    *args: Any,
    **kwargs: Any,
) -> Any:
    """Run bounded document work without blocking asyncio stage timers."""

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        executor,
        functools.partial(function, *args, **kwargs),
    )


def _consume_authority_task(task: asyncio.Task[Any]) -> None:
    """Consume a detached child result without publishing late row changes."""

    try:
        task.result()
    except BaseException:
        pass


async def _cancel_authority_tasks(
    tasks: Iterable[asyncio.Task[Any]],
    *,
    deadline: float,
) -> None:
    """Cancel owned tasks and bound cleanup by the stage's absolute deadline."""

    owned = list(tasks)
    for task in owned:
        if not task.done():
            task.cancel()
    if not owned:
        return
    cleanup_budget = max(0.0, deadline - time.monotonic())
    done, pending = await asyncio.wait(owned, timeout=cleanup_budget)
    for task in done:
        _consume_authority_task(task)
    for task in pending:
        task.add_done_callback(_consume_authority_task)


def _interpret_direct_response(
    response: httpx.Response,
    *,
    content_type: str,
    is_html: bool,
    is_json: bool,
) -> Dict[str, Any]:
    """Decode and interpret one bounded response away from the event loop."""

    response_text = response.text
    if (
        is_html
        or str(response.headers.get("cf-mitigated") or "")
    ) and _looks_like_retrieval_challenge(response.headers, response_text):
        raise RetrievalChallengeError(
            "direct retrieval returned an anti-bot challenge"
        )
    response.raise_for_status()
    if (
        "text" not in content_type
        and not is_html
        and "xml" not in content_type
        and not is_json
    ):
        raise ValueError("authority document is not textual")
    raw_structured_text = response_text if (is_html or is_json) else ""
    return {
        "text": _normalized_document_text(response_text, is_html=is_html),
        "raw_structured_text": raw_structured_text,
        "commercial_offer_evidence": (
            _commercial_offer_evidence(response_text) if is_html else []
        ),
        "structured_statistical_observations": (
            _structured_statistical_observations(response_text)
            if raw_structured_text
            else []
        ),
    }


async def fetch_direct_text(
    url: str,
    *,
    maximum_bytes: int = 2_000_000,
    operation_seconds: float = _DIRECT_FETCH_OPERATION_SECONDS,
    attempt_seconds: float = _DIRECT_FETCH_ATTEMPT_SECONDS,
) -> Dict[str, str]:
    """Fetch text with per-hop SSRF checks and bounded redirects/body size."""

    current = str(url or "")
    deadline = time.monotonic() + max(1.0, operation_seconds)
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(max(1.0, attempt_seconds)),
        follow_redirects=False,
    ) as client:
        for _ in range(_MAX_DIRECT_FETCH_REDIRECTS + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("authority document fetch deadline exceeded")
            parsed = urlparse(current)
            if (
                parsed.scheme.casefold() != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
            ):
                raise ValueError("unsafe authority URL")
            try:
                async with asyncio.timeout(
                    min(_DIRECT_FETCH_DNS_SECONDS, remaining)
                ):
                    public_host = await _public_hostname(parsed.hostname)
            except asyncio.TimeoutError as exc:
                raise TimeoutError("authority DNS resolution deadline exceeded") from exc
            if not public_host:
                raise ValueError("unsafe authority URL")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("authority document fetch deadline exceeded")
            try:
                async with asyncio.timeout(remaining):
                    response = await client.get(
                        current,
                        headers={"User-Agent": "AxWiseResearch/1.0"},
                        timeout=min(max(1.0, attempt_seconds), remaining),
                    )
            except asyncio.TimeoutError as exc:
                raise TimeoutError("authority document fetch deadline exceeded") from exc
            if response.is_redirect:
                target = response.headers.get("location")
                if not target:
                    raise ValueError("authority redirect omitted location")
                current = urljoin(current, target)
                continue
            content = response.content
            if len(content) > maximum_bytes:
                raise ValueError("authority document exceeds size limit")
            content_type = response.headers.get("content-type", "").casefold()
            is_html = "html" in content_type
            is_json = re.search(
                r"(?:^|[;/\s])application/(?:[a-z0-9.+-]+\+)?json(?:[;\s]|$)",
                content_type,
            ) is not None
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("authority document fetch deadline exceeded")
            try:
                async with asyncio.timeout(remaining):
                    interpreted = await _run_authority_cpu(
                        _AUTHORITY_PARSE_EXECUTOR,
                        _interpret_direct_response,
                        response,
                        content_type=content_type,
                        is_html=is_html,
                        is_json=is_json,
                    )
            except asyncio.TimeoutError as exc:
                raise TimeoutError("authority document parse deadline exceeded") from exc
            return {
                "final_url": str(response.url),
                "text": interpreted["text"],
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                # Internal-only, bounded by ``maximum_bytes`` and stripped
                # before source persistence. Proof builders re-derive typed
                # evidence from these exact fetched bytes.
                # Historical key retained for persistence compatibility. Its
                # content is exact fetched structured text: HTML or JSON-stat.
                "_structured_evidence_html": interpreted["raw_structured_text"],
                "commercial_offer_evidence": interpreted["commercial_offer_evidence"],
                "structured_statistical_observations": interpreted[
                    "structured_statistical_observations"
                ],
            }
    raise ValueError("authority URL exceeded redirect limit")


def _enrich_authority_row_outcome(
    source: Mapping[str, Any],
    direct: Mapping[str, Any],
    attestation_documents: tuple[
        tuple[Mapping[str, Any], Optional[str]], ...
    ],
) -> Dict[str, Any]:
    """Build one immutable enrichment outcome on a worker thread."""

    row = dict(source)
    raw_document = str(
        direct.get("_structured_evidence_html") or direct.get("text") or ""
    )
    if _looks_like_retrieval_challenge({}, raw_document):
        row["direct_fetch_status"] = "rejected_challenge"
        row["jurisdiction_binding_status"] = "rejected_retrieval_challenge"
        row["resolved_url"] = direct.get("final_url")
        return row

    row["direct_fetch_status"] = "retrieved"
    row["resolved_url"] = direct.get("final_url")
    row["_direct_document_candidate"] = dict(direct)
    row.setdefault("retrieval_url", row.get("url"))
    final_url = str(direct.get("final_url") or "")
    direct_text = str(direct.get("text") or "")
    jurisdiction_bound = _document_binds_jurisdiction(
        final_url=final_url,
        text=direct_text,
        country_codes=row.get("country_codes") or [],
        market_terms=row.get("market_terms") or [],
    )
    row["jurisdiction_binding_status"] = (
        "verified" if jurisdiction_bound else "rejected"
    )
    if not jurisdiction_bound:
        return row

    retrieved_at = str(
        direct.get("retrieved_at") or datetime.now(timezone.utc).isoformat()
    )
    raw_structured = str(direct.get("_structured_evidence_html") or "")
    if is_trusted_public_root(final_url):
        if not _recognized_root_covers_jurisdiction(
            final_url,
            row.get("country_codes") or [],
        ):
            row["jurisdiction_binding_status"] = "rejected_authority_jurisdiction"
            return row
        try:
            proof = build_recognized_root_proof(
                direct_url=final_url,
                direct_text=direct_text,
                country_codes=row.get("country_codes") or [],
                structured_statistical_observations=list(
                    direct.get("structured_statistical_observations") or []
                ),
                direct_raw_html=raw_structured or None,
                retrieved_at=retrieved_at,
            )
        except ValueError:
            row["jurisdiction_binding_status"] = (
                "rejected_structured_reporter_jurisdiction"
            )
            return row
        row.update(
            {
                "url": final_url,
                "publisher": _host(final_url),
                "source_authority": "official_public",
                "authority_verification_status": "recognized_public_root_direct",
                "authority_proof": proof,
                "provider_redirect": False,
                "retrieved_at": retrieved_at,
                "authority_document_artifact": {
                    "artifact_type": "direct_authority_document",
                    "text": direct_text,
                    "sha256": proof["direct"]["content_sha256"],
                    "retrieved_at": retrieved_at,
                    "authority_proof_signature": proof["proof_signature"],
                },
            }
        )
        return row

    direct_host = _host(final_url)
    attested = next(
        (
            document
            for document, target_authority_host in attestation_documents
            if (
                not target_authority_host
                or target_authority_host == direct_host
            )
            and _host_reference_match(
                str(document.get("text") or ""), direct_host
            )
        ),
        None,
    )
    if attested:
        try:
            proof = build_attested_authority_proof(
                direct_url=final_url,
                direct_text=direct_text,
                attestation_url=str(attested.get("final_url") or ""),
                attestation_text=str(attested.get("text") or ""),
                country_codes=row.get("country_codes") or [],
                structured_statistical_observations=list(
                    direct.get("structured_statistical_observations") or []
                ),
                direct_raw_html=raw_structured or None,
                retrieved_at=retrieved_at,
            )
        except ValueError:
            pass
        else:
            row.update(
                {
                    "url": final_url,
                    "publisher": _host(final_url),
                    "source_authority": "official_public",
                    "authority_verification_status": (
                        "independently_attested_direct_domain"
                    ),
                    "authority_proof": proof,
                    "provider_redirect": False,
                    "retrieved_at": retrieved_at,
                    "authority_document_artifact": {
                        "artifact_type": "direct_authority_document",
                        "text": direct_text,
                        "sha256": proof["direct"]["content_sha256"],
                        "retrieved_at": retrieved_at,
                        "authority_proof_signature": proof["proof_signature"],
                    },
                }
            )
            return row

    try:
        proof = build_direct_primary_market_proof(
            direct_url=final_url,
            direct_text=direct_text,
            country_codes=row.get("country_codes") or [],
            commercial_offer_evidence=list(
                direct.get("commercial_offer_evidence") or []
            ),
            direct_raw_html=raw_structured or None,
            retrieved_at=retrieved_at,
        )
    except ValueError:
        return row
    row.update(
        {
            "url": final_url,
            "publisher": _host(final_url),
            "source_authority": "first_party_catalog",
            "authority_verification_status": "direct_primary_market_observation",
            "authority_proof": proof,
            "provider_redirect": False,
            "retrieved_at": retrieved_at,
            "authority_document_artifact": {
                "artifact_type": "direct_authority_document",
                "text": direct_text,
                "sha256": proof["direct"]["content_sha256"],
                "retrieved_at": retrieved_at,
                "authority_proof_signature": proof["proof_signature"],
            },
        }
    )
    return row


async def enrich_authority_sources(
    sources: list[Dict[str, Any]],
    *,
    fetcher: Callable[[str], Awaitable[Dict[str, str]]] = fetch_direct_text,
) -> list[Dict[str, Any]]:
    """Fetch candidates concurrently and attach independently attested proofs."""

    candidates = [row for row in sources if row.get("url")]
    stage_deadline = time.monotonic() + _AUTHORITY_ENRICHMENT_SECONDS
    semaphore = asyncio.Semaphore(_MAX_DIRECT_FETCH_CONCURRENCY)
    owned_tasks: list[asyncio.Task[Any]] = []

    async def bounded_fetch(row: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            cached = row.get("_direct_document_candidate")
            if isinstance(cached, Mapping):
                return {
                    "final_url": str(cached.get("final_url") or ""),
                    "text": str(cached.get("text") or ""),
                    "retrieved_at": str(cached.get("retrieved_at") or ""),
                    "commercial_offer_evidence": list(
                        cached.get("commercial_offer_evidence") or []
                    ),
                    "structured_statistical_observations": list(
                        cached.get("structured_statistical_observations") or []
                    ),
                    "_structured_evidence_html": str(
                        cached.get("_structured_evidence_html") or ""
                    ),
                }
            return await fetcher(str(row["url"]))

    fetch_tasks = [asyncio.create_task(bounded_fetch(row)) for row in candidates]
    owned_tasks.extend(fetch_tasks)
    documents: list[tuple[Dict[str, Any], Dict[str, Any]]] = []
    try:
        fetch_budget = max(
            0.0,
            stage_deadline
            - time.monotonic()
            - _AUTHORITY_PROOF_RESERVE_SECONDS,
        )
        done_fetch, pending_fetch = await asyncio.wait(
            fetch_tasks,
            timeout=fetch_budget,
        )

        for row, task in zip(candidates, fetch_tasks):
            if task not in done_fetch:
                row["direct_fetch_status"] = "stage_deadline_exceeded"
                continue
            try:
                document = task.result()
            except RetrievalChallengeError:
                row["direct_fetch_status"] = "rejected_challenge"
                row["jurisdiction_binding_status"] = "rejected_retrieval_challenge"
                continue
            except BaseException as exc:
                row["direct_fetch_status"] = f"failed:{type(exc).__name__}"
                continue
            raw_document = str(
                document.get("_structured_evidence_html")
                or document.get("text")
                or ""
            )
            if _looks_like_retrieval_challenge({}, raw_document):
                row["direct_fetch_status"] = "rejected_challenge"
                row["jurisdiction_binding_status"] = "rejected_retrieval_challenge"
                row["resolved_url"] = document.get("final_url")
                continue
            row["direct_fetch_status"] = "retrieved"
            row["resolved_url"] = document.get("final_url")
            row["_direct_document_candidate"] = dict(document)
            documents.append((row, document))

        # Do not let a cancellation-resistant irrelevant fetch prevent proof
        # construction for already completed official/catalogue documents.
        for task in pending_fetch:
            task.cancel()

        attestation_documents = tuple(
            (
                document,
                (
                    str(row.get("target_authority_host") or "")
                    .casefold()
                    .rstrip(".")
                    if row.get("_code_owned_attestation_acquisition_hint")
                    else None
                ),
            )
            for row, document in documents
            if is_trusted_public_root(str(document.get("final_url") or ""))
            and _recognized_root_covers_jurisdiction(
                str(document.get("final_url") or ""),
                row.get("country_codes") or [],
            )
            and (
                not row.get("_code_owned_attestation_acquisition_hint")
                or (
                    bool(str(row.get("target_authority_host") or "").strip())
                    and _document_binds_jurisdiction(
                        final_url=str(document.get("final_url") or ""),
                        text=str(document.get("text") or ""),
                        country_codes=row.get("country_codes") or [],
                        market_terms=row.get("market_terms") or [],
                    )
                    and bool(
                        _host_reference_match(
                            str(document.get("text") or ""),
                            str(row.get("target_authority_host") or ""),
                        )
                    )
                )
            )
        )
        proof_tasks = [
            asyncio.create_task(
                _run_authority_cpu(
                    _AUTHORITY_PROOF_EXECUTOR,
                    _enrich_authority_row_outcome,
                    dict(row),
                    dict(document),
                    attestation_documents,
                )
            )
            for row, document in documents
        ]
        owned_tasks.extend(proof_tasks)
        if proof_tasks:
            proof_budget = max(0.0, stage_deadline - time.monotonic())
            done_proofs, pending_proofs = await asyncio.wait(
                proof_tasks,
                timeout=proof_budget,
            )
        else:
            done_proofs, pending_proofs = set(), set()
        for task in pending_proofs:
            task.cancel()
        await asyncio.gather(*proof_tasks, return_exceptions=True)

        for (row, _document), task in zip(documents, proof_tasks):
            if task not in done_proofs:
                row.setdefault("jurisdiction_binding_status", "not_resolved")
                row["authority_processing_status"] = "stage_deadline_exceeded"
                continue
            try:
                outcome = task.result()
            except BaseException as exc:
                row["authority_processing_status"] = f"failed:{type(exc).__name__}"
                continue
            row.clear()
            row.update(outcome)
        return sources
    finally:
        await _cancel_authority_tasks(owned_tasks, deadline=stage_deadline)
