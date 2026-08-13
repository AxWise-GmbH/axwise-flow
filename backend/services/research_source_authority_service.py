"""Direct-source authority proofs for consequential grounded research.

The evaluator never trusts a producer-supplied ``source_authority`` label.  A
public authority on a non-government domain must be fetched directly and be
linked from an independently fetched government/EU root.  Proofs bind both
documents, their final HTTPS hosts, jurisdiction, excerpts, and retrieval time.
"""

from __future__ import annotations

import asyncio
import calendar
import hashlib
import hmac
import html
import ipaddress
import json
import os
import re
import socket
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from typing import Any, Awaitable, Callable, Dict, Iterable, Mapping, Optional
from urllib.parse import urljoin, urlparse

import httpx
import pycountry


AUTHORITY_PROOF_VERSION = "direct_authority_attestation_v1"
AUTHORITY_CLAIM_PROOF_VERSION = "direct_authority_claim_span_v1"
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
_MAX_RETAINED_AUTHORITY_TEXT = 100_000
_MAX_DIRECT_FETCH_CONCURRENCY = 8
_MAX_DIRECT_FETCH_REDIRECTS = 3
_DIRECT_FETCH_OPERATION_SECONDS = 30.0
_DIRECT_FETCH_ATTEMPT_SECONDS = 10.0
_DIRECT_FETCH_DNS_SECONDS = 5.0
_AUTHORITY_ENRICHMENT_SECONDS = 45.0
_EU_COUNTRY_CODES = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI",
    "FR", "GR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL",
    "PT", "RO", "SE", "SI", "SK",
}


class _VisibleTextParser(HTMLParser):
    """Small dependency-free extractor for deterministic citation text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag.casefold() in {"script", "style", "noscript"}:
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() in {"script", "style", "noscript"} and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden_depth and data.strip():
            self.parts.append(data)


def _normalized_document_text(value: str, *, is_html: bool) -> str:
    if is_html:
        parser = _VisibleTextParser()
        parser.feed(value)
        value = " ".join(parser.parts)
    return " ".join(value.split())[:_MAX_RETAINED_AUTHORITY_TEXT]


def _commercial_offer_evidence(value: str) -> list[Dict[str, str]]:
    """Extract bounded canonical Product/Offer fields from fetched raw HTML."""

    rows: list[Dict[str, str]] = []

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
            if "Product" not in (kinds or []):
                continue
            offers = product.get("offers")
            offer_rows = offers if isinstance(offers, list) else [offers]
            for offer in offer_rows:
                if not isinstance(offer, Mapping):
                    continue
                price = str(offer.get("price") or "").strip()
                currency = str(offer.get("priceCurrency") or "").strip().upper()
                identity = str(
                    product.get("sku")
                    or product.get("gtin13")
                    or product.get("gtin")
                    or product.get("mpn")
                    or ""
                ).strip()
                name = " ".join(str(product.get("name") or "").split())[:300]
                if not price or not re.fullmatch(r"[A-Z]{3}", currency) or not (identity or name):
                    continue
                canonical = {
                    "signal_type": "schema_org_product_offer",
                    "product_id": identity,
                    "product_name": name,
                    "price": price.replace(",", "."),
                    "price_currency": currency,
                    "availability": str(offer.get("availability") or "")[:200],
                }
                canonical["sha256"] = hashlib.sha256(
                    _canonical_bytes(canonical)
                ).hexdigest()
                rows.append(canonical)
                if len(rows) >= 24:
                    return rows
    # Some first-party storefronts render product grids from an HTML-escaped
    # component config rather than JSON-LD.  Parse only explicit product rows
    # with an ID/name, numeric price, and currency carried by that same row.
    for attribute in re.finditer(
        r"\bdata-config=(?P<quote>[\"'])(?P<body>.*?)(?P=quote)",
        value,
        re.IGNORECASE | re.DOTALL,
    ):
        encoded = attribute.group("body")
        if "priceSimple" not in encoded and "pricesimple" not in encoded.casefold():
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
                continue
            price_markup = html.unescape(str(product.get("price") or ""))
            _visible_price, currency = _visible_price_currency(price_markup)
            identity = str(product.get("sku") or product.get("id") or "").strip()
            name = " ".join(str(product.get("name") or "").split())[:300]
            if not re.fullmatch(r"[A-Z]{3}", currency) or not (identity or name):
                continue
            actions = product.get("actions")
            canonical = {
                "signal_type": "merchant_product_config",
                "product_id": identity,
                "product_name": name,
                "price": price,
                "price_currency": currency,
                "availability": (
                    "in_stock"
                    if isinstance(actions, Mapping)
                    and actions.get("isSalable") is True
                    else ""
                ),
            }
            canonical["sha256"] = hashlib.sha256(
                _canonical_bytes(canonical)
            ).hexdigest()
            rows.append(canonical)
            if len(rows) >= 24:
                return rows
    return rows


def _structured_statistical_observations(value: str) -> list[Dict[str, str]]:
    """Extract positional table observations from fetched statistical HTML.

    A flattened visible-text table loses row/column identity.  Only raw HTML
    can safely bind a value to its series and period without nearest-value
    guessing.  The canonical observation is HMAC-bound with the direct page.
    """

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
    return bool(
        row.get("signal_type") in {
            "schema_org_product_offer",
            "merchant_product_config",
        }
        and (row.get("product_id") or row.get("product_name"))
        and re.fullmatch(r"-?\d+(?:\.\d+)?", str(row.get("price") or ""))
        and re.fullmatch(r"[A-Z]{3}", str(row.get("price_currency") or ""))
        and hashlib.sha256(_canonical_bytes(unsigned)).hexdigest() == row.get("sha256")
    )


def _visible_price_currency(value: str) -> tuple[str, str]:
    number = re.search(r"-?\d+(?:[.,]\d+)?", value)
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
    return (number.group(0).replace(",", ".") if number else "", code)


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
    return any(
        token and token in normalized
        for token in (
            " ".join(str(row.get("product_id") or "").casefold().split()),
            " ".join(str(row.get("product_name") or "").casefold().split()),
        )
    )


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

    normalized = " ".join(str(claim_text or "").casefold().split())
    for offer in proof.get("commercial_offer_evidence") or []:
        if not isinstance(offer, Mapping) or not _offer_payload_is_valid(offer):
            continue
        product_terms = [
            " ".join(str(offer.get(key) or "").casefold().split())
            for key in ("product_id", "product_name")
            if offer.get(key)
        ]
        identity_matches = any(term and term in normalized for term in product_terms)
        if not identity_matches:
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
            and _offer_identity_occurs_in_text(offer, claim_text)
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
    excerpt_text = direct_text[:520]
    observations, table_artifacts, structured_source_sha256 = (
        _bound_structured_statistical_observations(
            structured_statistical_observations,
            direct_raw_html=direct_raw_html,
        )
    )
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
    commercial_offer_evidence: Optional[list[Dict[str, str]]] = None,
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
    matching_pairs = [
        (match, offer)
        for match in value_matches
        if (
            offer := _matching_commercial_offer_evidence(
                commercial_offer_evidence,
                visible_value=match.group(0),
                country_codes=normalized_country_codes,
            )
        )
        and _offer_identity_occurs_in_text(offer, direct_text)
    ]
    if not matching_pairs:
        raise ValueError("priced page contains no fetched structured Product/Offer evidence")
    value_match = matching_pairs[0][0]
    matching_offers: list[Dict[str, str]] = []
    seen_offer_hashes: set[str] = set()
    for _match, offer in matching_pairs:
        offer_hash = str(offer.get("sha256") or "")
        if offer_hash and offer_hash not in seen_offer_hashes:
            matching_offers.append(offer)
            seen_offer_hashes.add(offer_hash)
        if len(matching_offers) >= 24:
            break
    direct_excerpt = _excerpt(
        direct_text,
        value_match.group(0),  # type: ignore[union-attr]
        radius=520,
    )
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
        private_document = source.get("_authority_document_artifact")
        private_text = (
            private_document.get("text")
            if isinstance(private_document, Mapping)
            else None
        )
        if (
            not isinstance(private_text, str)
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
                public_host = await asyncio.wait_for(
                    _public_hostname(parsed.hostname),
                    timeout=min(_DIRECT_FETCH_DNS_SECONDS, remaining),
                )
            except asyncio.TimeoutError as exc:
                raise TimeoutError("authority DNS resolution deadline exceeded") from exc
            if not public_host:
                raise ValueError("unsafe authority URL")
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("authority document fetch deadline exceeded")
            response = await asyncio.wait_for(
                client.get(
                    current,
                    headers={"User-Agent": "AxWiseResearch/1.0"},
                    timeout=min(max(1.0, attempt_seconds), remaining),
                ),
                timeout=remaining,
            )
            if response.is_redirect:
                target = response.headers.get("location")
                if not target:
                    raise ValueError("authority redirect omitted location")
                current = urljoin(current, target)
                continue
            response.raise_for_status()
            content = response.content
            if len(content) > maximum_bytes:
                raise ValueError("authority document exceeds size limit")
            content_type = response.headers.get("content-type", "").casefold()
            if "text" not in content_type and "html" not in content_type and "xml" not in content_type:
                raise ValueError("authority document is not textual")
            text = _normalized_document_text(
                response.text,
                is_html="html" in content_type,
            )
            return {
                "final_url": str(response.url),
                "text": text,
                "retrieved_at": datetime.now(timezone.utc).isoformat(),
                # Internal-only, bounded by ``maximum_bytes`` and stripped
                # before source persistence. Proof builders re-derive typed
                # evidence from these exact fetched bytes.
                "_structured_evidence_html": (
                    response.text if "html" in content_type else ""
                ),
                "commercial_offer_evidence": _commercial_offer_evidence(
                    response.text
                ) if "html" in content_type else [],
                "structured_statistical_observations": (
                    _structured_statistical_observations(response.text)
                    if "html" in content_type
                    else []
                ),
            }
    raise ValueError("authority URL exceeded redirect limit")


async def enrich_authority_sources(
    sources: list[Dict[str, Any]],
    *,
    fetcher: Callable[[str], Awaitable[Dict[str, str]]] = fetch_direct_text,
) -> list[Dict[str, Any]]:
    """Fetch candidates concurrently and attach independently attested proofs."""

    candidates = [row for row in sources if row.get("url")]
    semaphore = asyncio.Semaphore(_MAX_DIRECT_FETCH_CONCURRENCY)

    async def bounded_fetch(row: Dict[str, Any]) -> Dict[str, str]:
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

    tasks = [asyncio.create_task(bounded_fetch(row)) for row in candidates]
    try:
        done, pending = await asyncio.wait(
            tasks, timeout=_AUTHORITY_ENRICHMENT_SECONDS
        )
    except asyncio.CancelledError:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    for task in pending:
        task.cancel()
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)
    documents: list[tuple[Dict[str, Any], Dict[str, str]]] = []
    for row, task in zip(candidates, tasks):
        if task not in done:
            row["direct_fetch_status"] = "stage_deadline_exceeded"
            continue
        try:
            document = task.result()
        except BaseException as exc:
            row["direct_fetch_status"] = f"failed:{type(exc).__name__}"
            continue
        row["direct_fetch_status"] = "retrieved"
        row["resolved_url"] = document.get("final_url")
        row["_direct_document_candidate"] = dict(document)
        documents.append((row, document))
    attestations = [
        (row, doc)
        for row, doc in documents
        if is_trusted_public_root(doc["final_url"])
        and _recognized_root_covers_jurisdiction(
            doc["final_url"],
            row.get("country_codes") or [],
        )
    ]
    for row, direct in documents:
        row.setdefault("retrieval_url", row.get("url"))
        jurisdiction_bound = _document_binds_jurisdiction(
            final_url=direct["final_url"],
            text=direct["text"],
            country_codes=row.get("country_codes") or [],
            market_terms=row.get("market_terms") or [],
        )
        row["jurisdiction_binding_status"] = (
            "verified" if jurisdiction_bound else "rejected"
        )
        if not jurisdiction_bound:
            continue
        if is_trusted_public_root(direct["final_url"]):
            if not _recognized_root_covers_jurisdiction(
                direct["final_url"],
                row.get("country_codes") or [],
            ):
                row["jurisdiction_binding_status"] = "rejected_authority_jurisdiction"
                continue
            retrieved_at = direct.get("retrieved_at") or datetime.now(
                timezone.utc
            ).isoformat()
            proof = build_recognized_root_proof(
                direct_url=direct["final_url"],
                direct_text=direct["text"],
                country_codes=row.get("country_codes") or [],
                structured_statistical_observations=list(
                    direct.get("structured_statistical_observations") or []
                ),
                direct_raw_html=str(
                    direct.get("_structured_evidence_html") or ""
                ) or None,
                retrieved_at=retrieved_at,
            )
            row.update(
                {
                    "url": direct["final_url"],
                    "publisher": _host(direct["final_url"]),
                    "source_authority": "official_public",
                    "authority_verification_status": "recognized_public_root_direct",
                    "authority_proof": proof,
                    "provider_redirect": False,
                    "retrieved_at": retrieved_at,
                    "authority_document_artifact": {
                        "artifact_type": "direct_authority_document",
                        "text": direct["text"],
                        "sha256": proof["direct"]["content_sha256"],
                        "retrieved_at": retrieved_at,
                        "authority_proof_signature": proof["proof_signature"],
                    },
                }
            )
            continue
        direct_host = _host(direct["final_url"])
        attested = next(
            (
                doc
                for _attestation_row, doc in attestations
                if _host_reference_match(doc["text"], direct_host)
            ),
            None,
        )
        if attested:
            try:
                retrieved_at = direct.get("retrieved_at") or datetime.now(
                    timezone.utc
                ).isoformat()
                proof = build_attested_authority_proof(
                    direct_url=direct["final_url"],
                    direct_text=direct["text"],
                    attestation_url=attested["final_url"],
                    attestation_text=attested["text"],
                    country_codes=row.get("country_codes") or [],
                    structured_statistical_observations=list(
                        direct.get("structured_statistical_observations") or []
                    ),
                    direct_raw_html=str(
                        direct.get("_structured_evidence_html") or ""
                    ) or None,
                    retrieved_at=retrieved_at,
                )
            except ValueError:
                pass
            else:
                row.update(
                    {
                        "url": direct["final_url"],
                        "publisher": _host(direct["final_url"]),
                        "source_authority": "official_public",
                        "authority_verification_status": "independently_attested_direct_domain",
                        "authority_proof": proof,
                        "provider_redirect": False,
                        "retrieved_at": retrieved_at,
                        "authority_document_artifact": {
                            "artifact_type": "direct_authority_document",
                            "text": direct["text"],
                            "sha256": proof["direct"]["content_sha256"],
                            "retrieved_at": retrieved_at,
                            "authority_proof_signature": proof["proof_signature"],
                        },
                    }
                )
                continue
        try:
            retrieved_at = direct.get("retrieved_at") or datetime.now(
                timezone.utc
            ).isoformat()
            proof = build_direct_primary_market_proof(
                direct_url=direct["final_url"],
                direct_text=direct["text"],
                country_codes=row.get("country_codes") or [],
                commercial_offer_evidence=list(
                    direct.get("commercial_offer_evidence") or []
                ),
                direct_raw_html=str(
                    direct.get("_structured_evidence_html") or ""
                ) or None,
                retrieved_at=retrieved_at,
            )
        except ValueError:
            continue
        row.update(
            {
                "url": direct["final_url"],
                "publisher": _host(direct["final_url"]),
                "source_authority": "first_party_catalog",
                "authority_verification_status": "direct_primary_market_observation",
                "authority_proof": proof,
                "provider_redirect": False,
                "retrieved_at": retrieved_at,
                "authority_document_artifact": {
                    "artifact_type": "direct_authority_document",
                    "text": direct["text"],
                    "sha256": proof["direct"]["content_sha256"],
                    "retrieved_at": retrieved_at,
                    "authority_proof_signature": proof["proof_signature"],
                },
            }
        )
    return sources
