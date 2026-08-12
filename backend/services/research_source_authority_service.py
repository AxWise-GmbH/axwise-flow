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
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Awaitable, Callable, Dict, Iterable, Mapping, Optional
from urllib.parse import urljoin, urlparse

import httpx


AUTHORITY_PROOF_VERSION = "direct_authority_attestation_v1"
AUTHORITY_CLAIM_PROOF_VERSION = "direct_authority_claim_span_v1"
_AUTHORITY_LANGUAGE = re.compile(
    r"\b(?:government|ministry|tax(?:ation)?(?: and customs)? (?:board|authority)|"
    r"customs (?:board|authority)|public authority|national statistics|statistics "
    r"office|regulator|regulatory authority|state agency|government agency)\b",
    re.IGNORECASE,
)
_PRIMARY_MARKET_LANGUAGE = re.compile(
    r"\b(?:price|priced|cost|fee|retail|catalog(?:ue)?|product|supplier|"
    r"distributor|channel|available|in stock)\b",
    re.IGNORECASE,
)
_PRIMARY_MARKET_VALUE = re.compile(
    r"(?:[€$£]\s*\d|\b\d[\d\s.,]*\s*(?:EUR|USD|GBP)(?:\b|(?=\s|$)))",
    re.IGNORECASE,
)
_MAX_RETAINED_AUTHORITY_TEXT = 100_000


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


def _excerpt(text: str, needle: str, radius: int = 260) -> Dict[str, Any]:
    index = text.casefold().find(needle.casefold())
    if index < 0:
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
    if not _AUTHORITY_LANGUAGE.search(direct_text):
        raise ValueError("direct publisher page does not identify a public authority")
    attestation_excerpt = _excerpt(attestation_text, direct_host)
    direct_match = _AUTHORITY_LANGUAGE.search(direct_text)
    direct_excerpt = _excerpt(direct_text, direct_match.group(0))
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
    excerpt_text = direct_text[:520]
    payload = {
        "version": AUTHORITY_PROOF_VERSION,
        "proof_type": "recognized_public_root_direct",
        "source_authority": "official_public",
        "country_codes": sorted(
            {str(value).upper() for value in country_codes if value}
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
    if parsed.scheme.casefold() != "https" or not host:
        raise ValueError("primary market publisher must be a direct HTTPS URL")
    if not language or not _PRIMARY_MARKET_VALUE.search(direct_text):
        raise ValueError("direct page contains no explicit priced market observation")
    direct_excerpt = _excerpt(direct_text, language.group(0), radius=520)
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
        if _host(source_url) not in str(attestation_excerpt.get("text") or "").casefold():
            return False
        if not _AUTHORITY_LANGUAGE.search(str(direct_excerpt.get("text") or "")):
            return False
    elif proof_type == "recognized_public_root_direct":
        if not is_trusted_public_root(str(direct.get("final_url") or "")):
            return False
    elif proof_type == "direct_primary_market_observation":
        expected_authority = "first_party_catalog"
        direct_url = str(direct.get("final_url") or "")
        if (
            urlparse(direct_url).scheme.casefold() != "https"
            or not _host(direct_url)
            or is_trusted_public_root(direct_url)
            or not _PRIMARY_MARKET_LANGUAGE.search(
                str(direct_excerpt.get("text") or "")
            )
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
    requested = {str(value).upper() for value in requested_country_codes if value}
    proof_countries = {str(value).upper() for value in proof.get("country_codes") or [] if value}
    source_countries = {str(value).upper() for value in source.get("country_codes") or [] if value}
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


async def fetch_direct_text(url: str, *, maximum_bytes: int = 2_000_000) -> Dict[str, str]:
    """Fetch text with per-hop SSRF checks and bounded redirects/body size."""

    current = str(url or "")
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=False) as client:
        for _ in range(4):
            parsed = urlparse(current)
            if (
                parsed.scheme.casefold() != "https"
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or not await _public_hostname(parsed.hostname)
            ):
                raise ValueError("unsafe authority URL")
            response = await client.get(current, headers={"User-Agent": "AxWiseResearch/1.0"})
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

    candidates = [row for row in sources if row.get("url") and not row.get("provider_redirect")]
    fetched = await asyncio.gather(
        *(fetcher(str(row["url"])) for row in candidates), return_exceptions=True
    )
    documents: list[tuple[Dict[str, Any], Dict[str, str]]] = []
    for row, document in zip(candidates, fetched):
        if not isinstance(document, BaseException):
            documents.append((row, document))
    attestations = [
        (row, doc)
        for row, doc in documents
        if is_trusted_public_root(doc["final_url"])
    ]
    for row, direct in documents:
        row.setdefault("retrieval_url", row.get("url"))
        if is_trusted_public_root(direct["final_url"]):
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
                if direct_host in doc["text"].casefold()
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
