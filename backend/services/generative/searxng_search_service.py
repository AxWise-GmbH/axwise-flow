"""Optional self-hosted SearXNG adapter for web-source diversity."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import httpx


logger = logging.getLogger(__name__)


class SearxngSearchService:
    """Query a configured SearXNG JSON API without relying on public instances."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = (base_url or os.getenv("SEARXNG_URL") or "").rstrip("/")

    def is_available(self) -> bool:
        if not self.base_url:
            return False
        parsed = urlparse(self.base_url)
        return parsed.scheme == "https" or (
            parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
        )

    def search_web_general(self, query: str) -> Dict[str, Any]:
        if not self.is_available():
            return {"text": "", "sources": [], "search_performed": False}

        try:
            response = httpx.get(
                f"{self.base_url}/search",
                params={
                    "q": query,
                    "format": "json",
                    "categories": "general",
                    "safesearch": 1,
                },
                timeout=20.0,
                follow_redirects=False,
            )
            response.raise_for_status()
            payload = response.json()
            rows = payload.get("results") if isinstance(payload, dict) else []
            sources = []
            claims = []
            passages = []
            for row in rows or []:
                if not isinstance(row, dict):
                    continue
                url = str(row.get("url") or "").strip()
                if not url.startswith("https://"):
                    continue
                title = str(row.get("title") or "Unknown").strip()[:500]
                content = str(row.get("content") or "").strip()[:1500]
                sources.append({"title": title, "url": url})
                if content:
                    claims.append(
                        {
                            "text": content,
                            "source_urls": [url],
                            "confidence_scores": [],
                            "verification_status": "search_snippet_not_independently_verified",
                        }
                    )
                passages.append(f"{title}\n{content}\n{url}")
                if len(sources) >= 10:
                    break
            return {
                "text": "\n\n".join(passages),
                "sources": sources,
                "claims": claims,
                "search_performed": bool(sources),
            }
        except Exception as exc:
            logger.warning("SearXNG search failed: %s", exc)
            return {
                "text": "",
                "sources": [],
                "search_performed": False,
                "error": type(exc).__name__,
            }
