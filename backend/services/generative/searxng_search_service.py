"""Optional self-hosted SearXNG adapter for web-source diversity."""

from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx


logger = logging.getLogger(__name__)


_GOOGLE_IDENTITY_ENDPOINT = (
    "http://metadata.google.internal/computeMetadata/v1/instance/"
    "service-accounts/default/identity"
)
_SEARXNG_REQUEST_SECONDS = 20.0
_MAX_SANITIZED_DISCOVERY_RESULTS = 30


class SearxngSearchService:
    """Query a configured SearXNG JSON API without relying on public instances."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        auth_mode: Optional[str] = None,
    ):
        self.base_url = (base_url or os.getenv("SEARXNG_URL") or "").rstrip("/")
        self.auth_mode = (
            auth_mode or os.getenv("SEARXNG_AUTH_MODE") or "none"
        ).casefold()

    def is_available(self) -> bool:
        if not self.base_url:
            return False
        parsed = urlparse(self.base_url)
        safe_transport = parsed.scheme == "https" or (
            parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
        )
        # Callers append the JSON API path themselves. Rejecting a copied
        # endpoint URL avoids the silent `/search/search` failure mode.
        return bool(
            safe_transport
            and parsed.username is None
            and parsed.password is None
            and parsed.query == ""
            and parsed.fragment == ""
            and parsed.path.rstrip("/") not in {"/search"}
        )

    @staticmethod
    def _unavailable_result() -> Dict[str, Any]:
        return {
            "text": "",
            "sources": [],
            "search_performed": False,
            "runtime_diagnostics": {
                "route": "searxng",
                "status": "unavailable",
                "elapsed_ms": 0,
                "call_count": 0,
                "retry_count": 0,
                "deadline_ms": 20_000,
                "fallback_used": False,
            },
        }

    @staticmethod
    def _failure_result(exc: Exception, *, started_at: float) -> Dict[str, Any]:
        # Exception strings from HTTP clients can include the full query URL.
        # Keep logs finite and content-free; typed diagnostics retain only
        # the error class and status code.
        logger.warning("SearXNG search failed: %s", type(exc).__name__)
        return {
            "text": "",
            "sources": [],
            "search_performed": False,
            "error": type(exc).__name__,
            "runtime_diagnostics": {
                "route": "searxng",
                "status": "error",
                "elapsed_ms": max(
                    0, round((time.monotonic() - started_at) * 1000)
                ),
                "call_count": 1,
                "retry_count": 0,
                "deadline_ms": 20_000,
                "fallback_used": False,
                "http_status": getattr(
                    getattr(exc, "response", None), "status_code", None
                ),
            },
        }

    @staticmethod
    def _result_from_response(
        response: httpx.Response, query: str, *, started_at: float
    ) -> Dict[str, Any]:
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(
            payload.get("results"), list
        ):
            raise ValueError("invalid SearXNG response shape")
        retrieved_at = datetime.now(timezone.utc).isoformat()
        raw_content = getattr(response, "content", None)
        if not isinstance(raw_content, (bytes, bytearray)):
            raw_content = str(payload).encode("utf-8")
        response_hash = hashlib.sha256(raw_content).hexdigest()
        query_id = hashlib.sha256(query.encode("utf-8")).hexdigest()[:20]
        rows = payload["results"]
        unresponsive = []
        for raw in payload.get("unresponsive_engines", [])[:20]:
            if isinstance(raw, (list, tuple)):
                engine = str(raw[0] if raw else "unknown")[:80]
                reason = str(raw[1] if len(raw) > 1 else "unresponsive")[:120]
            elif isinstance(raw, dict):
                engine = str(raw.get("engine") or raw.get("name") or "unknown")[:80]
                reason = str(
                    raw.get("reason") or raw.get("error") or "unresponsive"
                )[:120]
            else:
                engine = str(raw)[:80]
                reason = "unresponsive"
            unresponsive.append({"engine": engine, "reason": reason})
        sources = []
        claims = []
        passages = []
        invalid_result_count = 0
        for row in rows:
            if not isinstance(row, dict):
                invalid_result_count += 1
                continue
            url = str(row.get("url") or "").strip()
            if not url.startswith("https://"):
                invalid_result_count += 1
                continue
            title = str(row.get("title") or "Unknown").strip()[:500]
            content = str(row.get("content") or "").strip()[:1500]
            provider_source_id = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
            sources.append(
                {
                    "title": title,
                    "url": url,
                    "provider": "searxng",
                    "provider_source_id": f"searxng-{provider_source_id}",
                    "provider_response_hash": response_hash,
                    "provider_query_ids": [query_id],
                    "provider_queries": [query[:1000]],
                    "retrieved_at": retrieved_at,
                    "citation_metadata": {
                        "result_index": len(sources),
                        "snippet_hash": (
                            hashlib.sha256(content.encode("utf-8")).hexdigest()
                            if content
                            else None
                        ),
                    },
                }
            )
            if content:
                claims.append(
                    {
                        "text": content,
                        "source_urls": [url],
                        "confidence_scores": [],
                        "verification_status": (
                            "search_snippet_not_independently_verified"
                        ),
                        "provider": "searxng",
                        "provider_response_hash": response_hash,
                        "provider_query_ids": [query_id],
                        "provider_queries": [query[:1000]],
                        "segment_start": 0,
                        "segment_end": len(content),
                        "span_target": "source_snippet",
                        "provenance_artifact": {
                            "artifact_type": "source_snippet",
                            "text": content,
                            "sha256": hashlib.sha256(
                                content.encode("utf-8")
                            ).hexdigest(),
                        },
                    }
                )
            passages.append(f"{title}\n{content}\n{url}")
            # Preserve a bounded discovery pool for the workflow-v2 runner to
            # classify before applying its much smaller direct-fetch limit.
            # Search aggregators can interleave noisy generic rows ahead of an
            # eligible government, primary-law, or statistics publisher.
            if len(sources) >= _MAX_SANITIZED_DISCOVERY_RESULTS:
                break
        return {
            "text": "\n\n".join(passages),
            "sources": sources,
            "claims": claims,
            "provider": "searxng",
            "provider_response_hash": response_hash,
            "provider_query_ids": [query_id],
            "provider_queries": [query[:1000]],
            "search_performed": bool(sources),
            "runtime_diagnostics": {
                "route": "searxng",
                "status": (
                    "ok"
                    if sources
                    else (
                        "response_processing_error"
                        if rows and invalid_result_count == len(rows)
                        else "empty"
                    )
                ),
                "elapsed_ms": max(
                    0, round((time.monotonic() - started_at) * 1000)
                ),
                "call_count": 1,
                "retry_count": 0,
                "deadline_ms": 20_000,
                "fallback_used": False,
                "http_status": response.status_code,
                "result_count": len(sources),
                "invalid_result_count": invalid_result_count,
                "unresponsive_engines": unresponsive,
            },
        }

    def search_web_general(self, query: str) -> Dict[str, Any]:
        if not self.is_available():
            return self._unavailable_result()

        started_at = time.monotonic()
        try:
            headers = self._authorization_headers()
            response = httpx.get(
                f"{self.base_url}/search",
                params={
                    "q": query,
                    "format": "json",
                    "categories": "general",
                    "safesearch": 1,
                },
                timeout=_SEARXNG_REQUEST_SECONDS,
                follow_redirects=False,
                headers=headers,
            )
            return self._result_from_response(response, query, started_at=started_at)
        except Exception as exc:
            return self._failure_result(exc, started_at=started_at)

    async def search_web_general_async(self, query: str) -> Dict[str, Any]:
        """Cancellation-safe JSON search for workflow-v2 workers."""

        if not self.is_available():
            return self._unavailable_result()

        started_at = time.monotonic()
        try:
            async with httpx.AsyncClient(
                timeout=_SEARXNG_REQUEST_SECONDS,
                follow_redirects=False,
                trust_env=False,
            ) as client:
                headers = await self._authorization_headers_async(client)
                response = await client.get(
                    f"{self.base_url}/search",
                    params={
                        "q": query,
                        "format": "json",
                        "categories": "general",
                        "safesearch": 1,
                    },
                    headers=headers,
                )
            return self._result_from_response(response, query, started_at=started_at)
        except Exception as exc:
            return self._failure_result(exc, started_at=started_at)

    async def _authorization_headers_async(
        self, client: httpx.AsyncClient
    ) -> Dict[str, str]:
        """Fetch the Cloud Run audience token without a blocking worker thread."""

        if self.auth_mode in {"", "none"}:
            return {}
        if self.auth_mode != "google_identity":
            raise ValueError("unsupported SEARXNG_AUTH_MODE")

        response = await client.get(
            _GOOGLE_IDENTITY_ENDPOINT,
            params={"audience": self.base_url, "format": "full"},
            headers={"Metadata-Flavor": "Google"},
        )
        response.raise_for_status()
        if response.headers.get("Metadata-Flavor") != "Google":
            raise RuntimeError("SearXNG identity metadata response is invalid")
        token = response.text.strip()
        if (
            not token
            or len(token) > 16_384
            or any(character.isspace() for character in token)
        ):
            raise RuntimeError("SearXNG identity token unavailable")
        return {"Authorization": f"Bearer {token}"}

    def _authorization_headers(self) -> Dict[str, str]:
        """Use a Cloud Run identity token without accepting static bearer keys."""

        if self.auth_mode in {"", "none"}:
            return {}
        if self.auth_mode != "google_identity":
            raise ValueError("unsupported SEARXNG_AUTH_MODE")

        from google.auth.transport.requests import Request
        from google.oauth2 import id_token

        token = id_token.fetch_id_token(Request(), self.base_url)
        if not token:
            raise RuntimeError("SearXNG identity token unavailable")
        return {"Authorization": f"Bearer {token}"}
