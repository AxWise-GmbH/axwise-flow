"""Bounded direct retrieval for workflow-v2 fallback evidence.

The search fallback treats search results only as candidate locators.  This
module retrieves one candidate from its publisher and returns a small,
normalized, immutable text snapshot.  It deliberately has no dependency on
the legacy research pipeline or its authority state.
"""

from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import re
import socket
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit, urlunsplit

import httpcore
import httpx

from backend.domain.workflow_v2.contracts import is_canonical_public_https_url


_MAX_REDIRECTS = 4
_DEFAULT_MAXIMUM_BYTES = 1_000_000
_DEFAULT_MAXIMUM_TEXT_BYTES = 180_000
_DEFAULT_OPERATION_SECONDS = 30.0
_DEFAULT_ATTEMPT_SECONDS = 12.0
_ACCEPTED_CONTENT_TYPES = (
    "application/json",
    "application/ld+json",
    "application/xhtml+xml",
    "application/xml",
    "text/",
)
_CHALLENGE_MARKERS = (
    "cf-chl-",
    "checking your browser",
    "enable javascript and cookies to continue",
    "just a moment...",
    "verify you are human",
)


class _VisibleTextParser(HTMLParser):
    _HIDDEN_TAGS = frozenset({"script", "style", "noscript", "svg", "template"})

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() in self._HIDDEN_TAGS:
            self._hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.casefold() in self._HIDDEN_TAGS and self._hidden_depth:
            self._hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self._hidden_depth and data.strip():
            self.parts.append(data)


def canonical_public_url(value: str) -> str | None:
    """Return the contract-canonical public HTTPS form or ``None``."""

    if not value or any(character.isspace() for character in value):
        return None
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").encode("idna").decode("ascii").casefold()
        port = parsed.port
    except (UnicodeError, ValueError):
        return None
    if (
        parsed.scheme.casefold() != "https"
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
    ):
        return None
    canonical = urlunsplit(("https", hostname, parsed.path or "", parsed.query, ""))
    return canonical if is_canonical_public_https_url(canonical) else None


def _approved_ip_address(value: str) -> str:
    """Return one normalized public IP address or reject it before use."""

    if "%" in value:
        raise ValueError("unsafe direct source address")
    try:
        address = ipaddress.ip_address(value)
    except ValueError as error:
        raise ValueError("unsafe direct source address") from error
    if not address.is_global:
        raise ValueError("unsafe direct source address")
    return address.compressed


async def _resolve_public_addresses(hostname: str) -> tuple[str, ...]:
    try:
        records = await asyncio.to_thread(
            socket.getaddrinfo,
            hostname,
            443,
            0,
            socket.SOCK_STREAM,
        )
    except OSError:
        return ()

    addresses: list[str] = []
    try:
        for record in records:
            address = _approved_ip_address(record[4][0])
            if address not in addresses:
                addresses.append(address)
    except ValueError:
        # Fail the whole resolution closed if DNS mixes public and unsafe
        # answers.  Selecting only the public subset would leave rebinding and
        # split-horizon behavior ambiguous.
        return ()
    return tuple(addresses)


class _PinnedNetworkBackend(httpcore.AsyncNetworkBackend):
    """Connect an HTTPS origin only to its already-approved DNS answers.

    httpcore still owns TLS and receives the original origin hostname, so SNI
    and certificate verification use the publisher hostname rather than the
    numeric address selected here.
    """

    def __init__(
        self,
        hostname: str,
        approved_addresses: Iterable[str],
        *,
        backend: httpcore.AsyncNetworkBackend | None = None,
    ) -> None:
        self._hostname = hostname.encode("idna").decode("ascii").casefold()
        self._addresses = tuple(
            dict.fromkeys(_approved_ip_address(value) for value in approved_addresses)
        )
        if not self._addresses:
            raise ValueError("unsafe direct source host")
        self._backend = backend or httpcore.AnyIOBackend()

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options: Iterable[tuple[int, int, int | bytes]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        try:
            requested_hostname = host.encode("idna").decode("ascii").casefold()
        except UnicodeError as error:
            raise httpcore.ConnectError("pinned direct source host mismatch") from error
        if requested_hostname != self._hostname or port != 443:
            raise httpcore.ConnectError("pinned direct source host mismatch")

        last_error: httpcore.ConnectError | httpcore.ConnectTimeout | None = None
        for address in self._addresses:
            try:
                return await self._backend.connect_tcp(
                    host=address,
                    port=port,
                    timeout=timeout,
                    local_address=local_address,
                    socket_options=socket_options,
                )
            except (httpcore.ConnectError, httpcore.ConnectTimeout) as error:
                last_error = error
        assert last_error is not None
        raise last_error

    async def connect_unix_socket(
        self,
        path: str,
        timeout: float | None = None,
        socket_options: Iterable[tuple[int, int, int | bytes]] | None = None,
    ) -> httpcore.AsyncNetworkStream:
        raise httpcore.ConnectError("direct source Unix sockets are disabled")

    async def sleep(self, seconds: float) -> None:
        await self._backend.sleep(seconds)


class _PinnedAsyncHTTPTransport(httpx.AsyncHTTPTransport):
    """httpx transport backed by one host's immutable approved address set."""

    def __init__(self, hostname: str, approved_addresses: tuple[str, ...]) -> None:
        # AsyncHTTPTransport delegates request framing and TLS to httpcore.  A
        # custom pool is required because httpx does not expose
        # ``network_backend`` as a constructor parameter.
        self._pool = httpcore.AsyncConnectionPool(
            ssl_context=httpx.create_ssl_context(verify=True, trust_env=False),
            max_connections=1,
            max_keepalive_connections=0,
            http1=True,
            http2=False,
            retries=0,
            network_backend=_PinnedNetworkBackend(hostname, approved_addresses),
        )


def _connected_peer_is_approved(
    response: httpx.Response,
    approved_addresses: tuple[str, ...],
) -> bool | None:
    """Validate the address used by the live connection, when observable.

    Resolving before a request prevents obvious private targets, while checking
    the actual socket peer closes the DNS-rebinding gap between that lookup and
    httpx's connection lookup.  Production's standard transport exposes the
    network stream; a custom injected test transport may not.
    """

    stream = response.extensions.get("network_stream")
    get_extra_info = getattr(stream, "get_extra_info", None)
    if not callable(get_extra_info):
        return None
    try:
        peer = get_extra_info("server_addr")
        address = peer[0] if isinstance(peer, tuple) and peer else peer
        if not isinstance(address, str) or not address:
            return False
        return _approved_ip_address(address) in approved_addresses
    except (TypeError, ValueError):
        return False


def _decoded_text(content: bytes, content_type: str) -> str:
    charset_match = re.search(r"charset\s*=\s*['\"]?([^;'\"\s]+)", content_type)
    charset = charset_match.group(1) if charset_match else "utf-8"
    try:
        return content.decode(charset, errors="replace")
    except LookupError:
        return content.decode("utf-8", errors="replace")


def _normalized_text(content: bytes, content_type: str) -> str:
    decoded = _decoded_text(content, content_type)
    if "html" in content_type:
        parser = _VisibleTextParser()
        parser.feed(decoded)
        decoded = "\n".join(parser.parts)
    return re.sub(r"[\t\r\f\v ]+", " ", re.sub(r"\n{3,}", "\n\n", decoded)).strip()


def _bounded_utf8(value: str, maximum_bytes: int) -> str:
    encoded = value.encode("utf-8")
    if len(encoded) <= maximum_bytes:
        return value
    return encoded[:maximum_bytes].decode("utf-8", errors="ignore").rstrip()


async def fetch_direct_source(
    url: str,
    *,
    maximum_bytes: int = _DEFAULT_MAXIMUM_BYTES,
    maximum_text_bytes: int = _DEFAULT_MAXIMUM_TEXT_BYTES,
    operation_seconds: float = _DEFAULT_OPERATION_SECONDS,
    attempt_seconds: float = _DEFAULT_ATTEMPT_SECONDS,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch one public textual document with per-hop SSRF and size gates."""

    if maximum_bytes < 1 or maximum_text_bytes < 1:
        raise ValueError("direct source limits must be positive")
    current = canonical_public_url(url)
    if current is None:
        raise ValueError("unsafe direct source URL")
    loop = asyncio.get_running_loop()
    deadline = loop.time() + max(1.0, operation_seconds)
    owns_client = client is None
    for _ in range(_MAX_REDIRECTS + 1):
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError("direct source operation deadline exceeded")
        hostname = urlsplit(current).hostname or ""
        async with asyncio.timeout(min(5.0, remaining)):
            approved_addresses = await _resolve_public_addresses(hostname)
            if not approved_addresses:
                raise ValueError("unsafe direct source host")
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise TimeoutError("direct source operation deadline exceeded")

        active_client = client or httpx.AsyncClient(
            transport=_PinnedAsyncHTTPTransport(hostname, approved_addresses),
            timeout=httpx.Timeout(max(1.0, attempt_seconds), connect=5.0),
            follow_redirects=False,
            trust_env=False,
        )
        try:
            async with asyncio.timeout(remaining):
                async with active_client.stream(
                    "GET",
                    current,
                    headers={
                        "Accept": "text/html,application/xhtml+xml,application/json,text/plain,application/xml;q=0.9",
                        "Accept-Encoding": "identity",
                        "User-Agent": "AxWiseWorkflowV2Research/1.0",
                    },
                    follow_redirects=False,
                    timeout=min(max(1.0, attempt_seconds), remaining),
                ) as response:
                    connected_peer_is_approved = _connected_peer_is_approved(
                        response,
                        approved_addresses,
                    )
                    if connected_peer_is_approved is False or (
                        owns_client and connected_peer_is_approved is None
                    ):
                        raise ValueError("unsafe direct source connection peer")
                    if "content-encoding" in response.headers:
                        raise ValueError("direct source encoded responses are disabled")
                    if response.is_redirect:
                        target = response.headers.get("location")
                        if not target:
                            raise ValueError("direct source redirect omitted location")
                        redirected = canonical_public_url(urljoin(current, target))
                        if redirected is None:
                            raise ValueError("unsafe direct source redirect")
                        current = redirected
                        continue
                    response.raise_for_status()
                    content_type = response.headers.get("content-type", "").casefold()
                    if not any(marker in content_type for marker in _ACCEPTED_CONTENT_TYPES):
                        raise ValueError("direct source is not textual")
                    content_length = response.headers.get("content-length")
                    if content_length is not None:
                        try:
                            declared_length = int(content_length)
                        except ValueError as error:
                            raise ValueError(
                                "direct source has invalid content length"
                            ) from error
                        if declared_length < 0 or declared_length > maximum_bytes:
                            raise ValueError("direct source exceeds size limit")
                    chunks: list[bytes] = []
                    byte_count = 0
                    if response.is_stream_consumed:
                        # Mock/custom transports may materialize an unencoded
                        # body before returning it.  The production transport
                        # never takes this path; keep injected-client tests
                        # bounded without attempting a second stream read.
                        byte_count = len(response.content)
                        if byte_count > maximum_bytes:
                            raise ValueError("direct source exceeds size limit")
                        chunks.append(response.content)
                    else:
                        async for chunk in response.aiter_raw():
                            byte_count += len(chunk)
                            if byte_count > maximum_bytes:
                                raise ValueError("direct source exceeds size limit")
                            chunks.append(chunk)
                    normalized = _bounded_utf8(
                        _normalized_text(b"".join(chunks), content_type),
                        maximum_text_bytes,
                    )
                    lowered_prefix = normalized[:40_000].casefold()
                    if not normalized:
                        raise ValueError("direct source contains no text")
                    if any(marker in lowered_prefix for marker in _CHALLENGE_MARKERS):
                        raise ValueError("direct source returned an access challenge")
                    final_url = canonical_public_url(str(response.url))
                    if final_url is None:
                        raise ValueError("direct source final URL is unsafe")
                    retrieved_at = (
                        datetime.now(timezone.utc)
                        .isoformat(timespec="microseconds")
                        .replace("+00:00", "Z")
                        .replace(".000000Z", "Z")
                    )
                    return {
                        "final_url": final_url,
                        "text": normalized,
                        "retrieved_at": retrieved_at,
                        "content_sha256": hashlib.sha256(
                            normalized.encode("utf-8")
                        ).hexdigest(),
                    }
        finally:
            if owns_client:
                await active_client.aclose()
    raise ValueError("direct source exceeded redirect limit")
