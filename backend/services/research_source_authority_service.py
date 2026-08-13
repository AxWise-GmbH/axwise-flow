"""Direct-source authority proofs for consequential grounded research.

The evaluator never trusts a producer-supplied ``source_authority`` label.  A
public authority on a non-government domain must be fetched directly and be
linked from an independently fetched government/EU root.  Proofs bind both
documents, their final HTTPS hosts, jurisdiction, excerpts, and retrieval time.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import re
import socket
import time
from datetime import datetime, timezone
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
    rf"(?:[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾]\s*\d|"
    rf"\b(?:{_ISO_CURRENCY_CODES})\s*\d|"
    rf"\b\d[\d\s.,]*\s*(?:{_ISO_CURRENCY_CODES}|euros?|dollars?|pounds?|"
    rf"yen|yuan|rupees?)(?:\b|(?=\s|$))|"
    rf"\b\d[\d\s.,]*\s*[€$£¥₹₩₽₺₫฿₱₪₴₦₲₵₡₸₮₾])",
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
    retrieved_at: Optional[str] = None,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a proof from two already-fetched, bounded HTTPS documents."""

    direct_host = _host(direct_url)
    attestation_host = _host(attestation_url)
    if not direct_host or urlparse(direct_url).scheme.casefold() != "https":
        raise ValueError("authority publisher must be a direct HTTPS URL")
    if not is_trusted_public_root(attestation_url):
        raise ValueError("authority attestation must come from a government/EU root")
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
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "independent_public_root_attestation",
        "source_authority": "official_public",
        "country_codes": sorted(
            {str(value).upper() for value in country_codes if value}
        ),
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
    retrieved_at: Optional[str] = None,
    signing_secret: Optional[str] = None,
) -> Dict[str, Any]:
    """Bind a directly fetched first-party catalogue/retailer observation.

    This proof does not claim that the publisher is a regulator or that an
    observed price generalizes to a whole market. It proves only that a dated,
    exact commercial observation appeared on the fetched HTTPS publisher page.
    """

    parsed = urlparse(str(direct_url or ""))
    host = _host(direct_url)
    language = _PRIMARY_MARKET_LANGUAGE.search(direct_text)
    value_match = _PRIMARY_MARKET_VALUE.search(direct_text)
    if parsed.scheme.casefold() != "https" or not host:
        raise ValueError("primary market publisher must be a direct HTTPS URL")
    if not value_match:
        raise ValueError("direct page contains no explicit priced market observation")
    direct_excerpt = _excerpt(
        direct_text,
        (language or value_match).group(0),
        radius=520,
    )
    if not _PRIMARY_MARKET_VALUE.search(direct_excerpt["text"]):
        # The value and commercial label must occur in the same bounded proof
        # excerpt; a price elsewhere on a large page is not enough.
        raise ValueError("priced observation is not locally bound to the catalogue context")
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "direct_primary_market_observation",
        "source_authority": "first_party_catalog",
        "country_codes": sorted(
            {str(value).upper() for value in country_codes if value}
        ),
        "direct": {
            "final_url": direct_url,
            "final_host": host,
            "content_sha256": hashlib.sha256(direct_text.encode("utf-8")).hexdigest(),
            "excerpt": direct_excerpt,
        },
        "retrieved_at": retrieved_at or datetime.now(timezone.utc).isoformat(),
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
        if not isinstance(attestation, Mapping) or not is_trusted_public_root(
            str(attestation.get("final_url") or "")
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
            urlparse(direct_url).scheme.casefold() != "https"
            or not _host(direct_url)
            or is_trusted_public_root(direct_url)
            or not _PRIMARY_MARKET_VALUE.search(
                str(direct_excerpt.get("text") or "")
            )
        ):
            return False
    else:
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
            return await fetcher(str(row["url"]))

    tasks = [asyncio.create_task(bounded_fetch(row)) for row in candidates]
    done, pending = await asyncio.wait(tasks, timeout=_AUTHORITY_ENRICHMENT_SECONDS)
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
        documents.append((row, document))
    attestations = [
        (row, doc)
        for row, doc in documents
        if is_trusted_public_root(doc["final_url"])
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
