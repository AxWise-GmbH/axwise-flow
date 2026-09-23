"""Low-latency grounded answers for the explicit desktop quick-info capability."""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit

from google import genai

from backend.domain.workflow_v2.contracts import (
    is_canonical_public_https_url,
    utf16_ordinal_sorted,
)
from backend.services.llm.gemini_runtime import RESEARCH_MODEL
from backend.services.workflow_v2.cognitive.typesafe_triage import (
    QuickInfoRouteDecision,
    QuickInfoRouteUnavailable,
    classify_quick_info_route,
)


DEFAULT_QUICK_INFO_DEADLINE_SECONDS = 15.0
DEFAULT_QUICK_INFO_TTL_SECONDS = 120.0
MAX_QUICK_INFO_CACHE_ENTRIES = 256


class AssistantQuickInfoError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class QuickInfoSource:
    title: str
    url: str


@dataclass(frozen=True)
class QuickInfoFact:
    statement: str
    source_urls: tuple[str, ...]


@dataclass(frozen=True)
class AssistantQuickInfoResult:
    markdown: str
    sources: tuple[QuickInfoSource, ...]
    facts: tuple[QuickInfoFact, ...]
    model: str
    model_version: str | None
    input_tokens: int | None
    output_tokens: int | None
    search_calls: int
    cache_hit: bool = False


def _usage_value(response: Any, name: str) -> int | None:
    usage = getattr(response, "usage", None)
    value = getattr(usage, name, None)
    return value if type(value) is int and value >= 0 else None


def _search_call_count(response: Any) -> int:
    calls = 0
    for step in getattr(response, "steps", None) or []:
        if getattr(step, "type", None) != "google_search_call":
            continue
        arguments = getattr(step, "arguments", None)
        queries = (
            arguments.get("queries")
            if isinstance(arguments, dict)
            else getattr(arguments, "queries", None)
        )
        calls += len(queries) if isinstance(queries, (list, tuple)) and queries else 1
    return calls


def _markdown_inline(value: str) -> str:
    """Keep cited text literal, including source titles containing Markdown."""

    normalized = re.sub(r"\s+", " ", value).strip()
    return re.sub(r"([\\`*_{}\[\]<>&|])", r"\\\1", normalized)


def _markdown_source_url(url: str) -> str:
    # Angle brackets delimit the destination, so encode them if a source URL
    # contains either character. The fact retains the original canonical URL.
    return url.replace("<", "%3C").replace(">", "%3E")


def _grounded_answer(
    response: Any, *, query: str,
) -> tuple[str, tuple[QuickInfoSource, ...], tuple[QuickInfoFact, ...]] | None:
    """Project only URL-cited byte ranges, discarding any uncited model prose."""

    output_text = getattr(response, "output_text", None)
    if not isinstance(output_text, str) or not output_text.strip():
        return None
    sources: dict[str, QuickInfoSource] = {}
    fact_urls: dict[str, set[str]] = {}
    for step in getattr(response, "steps", None) or []:
        if getattr(step, "type", None) != "model_output":
            continue
        for content in getattr(step, "content", None) or []:
            if getattr(content, "type", None) != "text":
                continue
            text = getattr(content, "text", None)
            if not isinstance(text, str) or not text:
                continue
            encoded = text.encode("utf-8")
            for annotation in getattr(content, "annotations", None) or []:
                if getattr(annotation, "type", None) != "url_citation":
                    continue
                url = getattr(annotation, "url", None)
                start = getattr(annotation, "start_index", None)
                end = getattr(annotation, "end_index", None)
                if (
                    not isinstance(url, str)
                    or not is_canonical_public_https_url(url)
                    or type(start) is not int
                    or type(end) is not int
                    or start < 0
                    or end <= start
                    or end > len(encoded)
                ):
                    continue
                try:
                    statement = encoded[start:end].decode("utf-8").strip()
                except UnicodeDecodeError:
                    continue
                if (
                    not statement
                    or len(statement) > 4000
                    or statement not in output_text
                ):
                    continue
                if url not in sources and len(sources) >= 10:
                    continue
                raw_title = getattr(annotation, "title", None)
                title = raw_title.strip()[:500] if isinstance(raw_title, str) else ""
                if not title:
                    title = (urlsplit(url).hostname or "Source")[:500]
                sources.setdefault(url, QuickInfoSource(title=title, url=url))
                fact_urls.setdefault(statement, set()).add(url)
    if not sources or not fact_urls:
        return None
    facts = tuple(
        QuickInfoFact(
            statement=statement,
            source_urls=tuple(utf16_ordinal_sorted(urls)),
        )
        for statement, urls in list(fact_urls.items())[:50]
    )
    headlines = re.search(r"\b(?:headlines?|news)\b", query, re.IGNORECASE) is not None
    if headlines:
        facts = facts[:3]
    cited_urls = {url for fact in facts for url in fact.source_urls}
    ordered_sources = tuple(
        sources[url] for url in utf16_ordinal_sorted(cited_urls)
    )
    lines = []
    for fact in facts:
        links = " ".join(
            f"[{_markdown_inline(sources[url].title)}](<{_markdown_source_url(url)}>)"
            for url in fact.source_urls
        )
        line = f"{_markdown_inline(fact.statement)} — {links}"
        lines.append(f"- {line}" if headlines else line)
    markdown = ("\n" if headlines else "\n\n").join(lines).strip()
    if not markdown or len(markdown) > 120_000:
        return None
    return markdown, ordered_sources, facts


class GeminiAssistantQuickInfoRunner:
    """Run search and optional JEV route admission concurrently, then fail closed."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        client: Any | None = None,
        route_classifier: Callable[
            [str, str | None], Awaitable[QuickInfoRouteDecision]
        ] = classify_quick_info_route,
        deadline_seconds: float = DEFAULT_QUICK_INFO_DEADLINE_SECONDS,
        ttl_seconds: float = DEFAULT_QUICK_INFO_TTL_SECONDS,
        clock=time.monotonic,
    ) -> None:
        if deadline_seconds <= 0 or deadline_seconds > 60:
            raise ValueError("quick-info deadline must be within one minute")
        if ttl_seconds < 0 or ttl_seconds > 3600:
            raise ValueError("quick-info cache TTL must be within one hour")
        credential = api_key or os.getenv("GEMINI_API_KEY")
        if client is None and not credential:
            raise RuntimeError("GEMINI_API_KEY is required for quick info")
        self.client = client or genai.Client(api_key=credential)
        self.route_classifier = route_classifier
        self.deadline_seconds = deadline_seconds
        self.ttl_seconds = ttl_seconds
        self.clock = clock
        self._owns_client = client is None
        self._cache: dict[
            tuple[str, str, bool], tuple[float, AssistantQuickInfoResult]
        ] = {}
        self._inflight: dict[
            tuple[str, str, bool], asyncio.Task[AssistantQuickInfoResult]
        ] = {}
        self._waiters: dict[tuple[str, str, bool], int] = {}
        self._lock = asyncio.Lock()

    async def quick_info(
        self,
        query: str,
        *,
        location: str | None,
        jev_enabled: bool,
    ) -> AssistantQuickInfoResult:
        normalized_query = re.sub(r"\s+", " ", query).strip()
        normalized_location = (
            re.sub(r"\s+", " ", location).strip() if location is not None else ""
        )
        if not normalized_query or len(normalized_query) > 2000:
            raise ValueError("quick-info query is outside the accepted boundary")
        if len(normalized_location) > 500:
            raise ValueError("quick-info location is outside the accepted boundary")
        if type(jev_enabled) is not bool:
            raise ValueError("quick-info JEV selection must be explicit")
        key = (
            normalized_query.casefold(),
            normalized_location.casefold(),
            jev_enabled,
        )
        now = self.clock()
        async with self._lock:
            for expired_key in [
                candidate
                for candidate, (expires_at, _result) in self._cache.items()
                if expires_at <= now
            ]:
                self._cache.pop(expired_key, None)
            cached = self._cache.get(key)
            if cached is not None and cached[0] > now:
                return replace(
                    cached[1],
                    input_tokens=0,
                    output_tokens=0,
                    search_calls=0,
                    cache_hit=True,
                )
            task = self._inflight.get(key)
            shared = task is not None
            if task is None:
                task = asyncio.create_task(
                    self._generate(
                        normalized_query,
                        location=normalized_location or None,
                        jev_enabled=jev_enabled,
                    )
                )
                self._inflight[key] = task
                task.add_done_callback(
                    lambda completed, cache_key=key: asyncio.create_task(
                        self._settle(cache_key, completed)
                    )
                )
            self._waiters[key] = self._waiters.get(key, 0) + 1
        try:
            result = await asyncio.shield(task)
        finally:
            await self._release_waiter(key, task)
        if shared:
            return replace(
                result,
                input_tokens=0,
                output_tokens=0,
                search_calls=0,
                cache_hit=True,
            )
        return result

    async def _release_waiter(
        self,
        key: tuple[str, str, bool],
        task: asyncio.Task[AssistantQuickInfoResult],
    ) -> None:
        cancel = False
        async with self._lock:
            remaining = self._waiters.get(key, 0) - 1
            if remaining > 0:
                self._waiters[key] = remaining
            else:
                self._waiters.pop(key, None)
                if not task.done() and self._inflight.get(key) is task:
                    self._inflight.pop(key, None)
                    cancel = True
        if cancel:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    async def _generate(
        self, query: str, *, location: str | None, jev_enabled: bool
    ) -> AssistantQuickInfoResult:
        prompt = (
            "Use Google Search once to give a concise, direct answer to this narrow current "
            "public-information request. Cite every factual statement with URL citations. "
            "For local news, return at most three fresh items, each as a separate short "
            "sentence with its own URL citation. Opening hours, sports scores "
            "or schedules, and current public facts should be answered directly. Do not do "
            "deep research, repository or device work, private or account-data access, or "
            "consequential medical, legal, or financial advice. Do not add uncited factual "
            f"claims. Request: {query}"
        )
        if location is not None:
            prompt += f"\nUser-supplied location context: {location}"

        async def search() -> Any:
            return await self.client.aio.interactions.create(
                model=RESEARCH_MODEL,
                input=prompt,
                tools=[{"type": "google_search"}],
                generation_config={"thinking_level": "low"},
                store=False,
            )

        async def run() -> AssistantQuickInfoResult:
            search_task = asyncio.create_task(search())
            try:
                if jev_enabled:
                    try:
                        decision = await self.route_classifier(query, location)
                    except QuickInfoRouteUnavailable:
                        raise AssistantQuickInfoError(
                            "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNAVAILABLE",
                            retryable=True,
                        ) from None
                    except Exception:
                        raise AssistantQuickInfoError(
                            "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNAVAILABLE",
                            retryable=True,
                        ) from None
                    if decision is None:
                        raise AssistantQuickInfoError(
                            "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNAVAILABLE",
                            retryable=True,
                        )
                    if decision.route != "quick_info":
                        raise AssistantQuickInfoError(
                            "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_MISMATCH",
                            retryable=False,
                        )
                    if not decision.confidently_quick_info:
                        raise AssistantQuickInfoError(
                            "AXWISE_ASSISTANT_QUICK_INFO_ROUTE_UNCERTAIN",
                            retryable=False,
                        )
                response = await search_task
            finally:
                if not search_task.done():
                    search_task.cancel()
                    await asyncio.gather(search_task, return_exceptions=True)
            grounded = _grounded_answer(response, query=query)
            search_calls = _search_call_count(response)
            if grounded is None or search_calls < 1:
                raise AssistantQuickInfoError(
                    "AXWISE_ASSISTANT_QUICK_INFO_UNGROUNDED", retryable=True
                )
            markdown, sources, facts = grounded
            version = getattr(response, "model", None)
            if not isinstance(version, str) or not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}", version
            ):
                version = None
            return AssistantQuickInfoResult(
                markdown=markdown,
                sources=sources,
                facts=facts,
                model=RESEARCH_MODEL,
                model_version=version,
                input_tokens=_usage_value(response, "total_input_tokens"),
                output_tokens=_usage_value(response, "total_output_tokens"),
                search_calls=search_calls,
            )

        try:
            return await asyncio.wait_for(run(), timeout=self.deadline_seconds)
        except AssistantQuickInfoError:
            raise
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            raise AssistantQuickInfoError(
                "AXWISE_ASSISTANT_QUICK_INFO_DEADLINE", retryable=True
            ) from None
        except Exception:
            raise AssistantQuickInfoError(
                "AXWISE_ASSISTANT_QUICK_INFO_PROVIDER_FAILED", retryable=True
            ) from None

    async def _settle(
        self,
        key: tuple[str, str, bool],
        task: asyncio.Task[AssistantQuickInfoResult],
    ) -> None:
        try:
            result = task.result()
        except asyncio.CancelledError:
            result = None
        except Exception:
            result = None
        async with self._lock:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)
            if result is None or not self.ttl_seconds:
                return
            while len(self._cache) >= MAX_QUICK_INFO_CACHE_ENTRIES:
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = (self.clock() + self.ttl_seconds, result)

    async def close(self) -> None:
        async with self._lock:
            pending = list(self._inflight.values())
            self._inflight.clear()
            self._waiters.clear()
            self._cache.clear()
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
        if not self._owns_client:
            return
        close = getattr(getattr(self.client, "aio", None), "aclose", None)
        if callable(close):
            await close()
        sync_close = getattr(self.client, "close", None)
        if callable(sync_close):
            sync_close()


__all__ = [
    "AssistantQuickInfoError",
    "AssistantQuickInfoResult",
    "GeminiAssistantQuickInfoRunner",
    "QuickInfoFact",
    "QuickInfoSource",
]
