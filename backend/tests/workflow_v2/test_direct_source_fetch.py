from __future__ import annotations

import hashlib
import ssl

import httpcore
import httpx
import pytest

from backend.services.workflow_v2 import direct_source_fetch as subject


pytestmark = pytest.mark.contract


@pytest.fixture(autouse=True)
def public_dns(monkeypatch: pytest.MonkeyPatch) -> None:
    async def allowed(_hostname: str) -> tuple[str, ...]:
        return ("93.184.216.34",)

    monkeypatch.setattr(subject, "_resolve_public_addresses", allowed)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (
            "https://EXAMPLE.org:443/path?q=1#fragment",
            "https://example.org/path?q=1",
        ),
        ("http://example.org/path", None),
        ("https://user@example.org/path", None),
        ("https://127.0.0.1/path", None),
        ("https://example.org:8443/path", None),
    ],
)
def test_canonical_public_url(value: str, expected: str | None) -> None:
    assert subject.canonical_public_url(value) == expected


@pytest.mark.asyncio
async def test_fetch_returns_bounded_normalized_immutable_html_snapshot() -> None:
    html = b"""
    <html><head><title>Official rule</title><style>hidden</style></head>
    <body><h1>Pet food rule</h1><script>ignore me</script>
    <p>Operators   must register.</p></body></html>
    """

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["user-agent"] == "AxWiseWorkflowV2Research/1.0"
        assert request.headers["accept-encoding"] == "identity"
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            content=html,
            request=request,
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        result = await subject.fetch_direct_source(
            "https://EXAMPLE.org:443/rule#section", client=client
        )

    assert result["final_url"] == "https://example.org/rule"
    assert result["text"] == "Official rule\nPet food rule\nOperators must register."
    assert result["content_sha256"] == hashlib.sha256(
        result["text"].encode("utf-8")
    ).hexdigest()
    assert result["retrieved_at"].endswith("Z")


@pytest.mark.asyncio
async def test_fetch_checks_and_canonicalizes_each_redirect() -> None:
    seen: list[str] = []
    checked_hosts: list[str] = []

    async def record_public_dns(hostname: str) -> tuple[str, ...]:
        checked_hosts.append(hostname)
        return ("93.184.216.34",)

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if request.url.host == "example.org":
            return httpx.Response(
                302,
                headers={"location": "https://PUBLISHER.example/rule#part"},
                request=request,
            )
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            text="Exact publisher passage.",
            request=request,
        )

    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(subject, "_resolve_public_addresses", record_public_dns)
        # The helper must force redirects off on every request even when an
        # injected caller configured its client to follow them automatically.
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), follow_redirects=True
        ) as client:
            result = await subject.fetch_direct_source(
                "https://example.org/start", client=client
            )

    assert seen == [
        "https://example.org/start",
        "https://publisher.example/rule",
    ]
    assert checked_hosts == ["example.org", "publisher.example"]
    assert result["final_url"] == "https://publisher.example/rule"


@pytest.mark.asyncio
async def test_fetch_uses_official_cellar_transport_for_exact_celex_locator() -> None:
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        assert request.headers["accept"] == "application/xhtml+xml,text/html;q=0.9"
        assert request.headers["accept-language"] == "eng"
        assert request.headers["accept-max-cs-size"] == "1000000"
        assert request.headers["user-agent"] == "AxWiseWorkflowV2Research/1.0"
        if request.url.path == "/resource/celex/32011R0142":
            return httpx.Response(
                302,
                headers={
                    "location": (
                        "http://publications.europa.eu/resource/cellar/"
                        "official-expression/DOC_1"
                    )
                },
                request=request,
            )
        return httpx.Response(
            200,
            headers={"content-type": "application/xhtml+xml;charset=UTF-8"},
            text="<html><body><p>Exact official legal passage.</p></body></html>",
            request=request,
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        result = await subject.fetch_direct_source(
            "https://EUR-LEX.EUROPA.EU/legal-content/EN/TXT/"
            "?uri=CELEX%3A32011r0142#annex",
            client=client,
        )

    assert seen == [
        "https://publications.europa.eu/resource/celex/32011R0142",
        "https://publications.europa.eu/resource/cellar/official-expression/DOC_1",
    ]
    assert result["final_url"] == (
        "https://eur-lex.europa.eu/legal-content/EN/TXT/"
        "?uri=CELEX%3A32011r0142"
    )
    assert result["text"] == "Exact official legal passage."


@pytest.mark.asyncio
async def test_fetch_does_not_infer_non_celex_or_upgrade_other_http_redirects() -> None:
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            302,
            headers={"location": "http://publisher.example/rule"},
            request=request,
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        with pytest.raises(ValueError, match="unsafe direct source redirect"):
            await subject.fetch_direct_source(
                "https://eur-lex.europa.eu/eli/reg/2011/142/oj/eng",
                client=client,
            )

    assert seen == ["https://eur-lex.europa.eu/eli/reg/2011/142/oj/eng"]


@pytest.mark.asyncio
async def test_fetch_rejects_cross_host_redirect_from_celex_transport() -> None:
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            302,
            headers={"location": "https://attacker.example/substituted-law"},
            request=request,
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        with pytest.raises(ValueError, match="unsafe direct source redirect"):
            await subject.fetch_direct_source(
                "https://eur-lex.europa.eu/legal-content/EN/TXT/"
                "?uri=CELEX:32011R0142",
                client=client,
            )

    assert seen == ["https://publications.europa.eu/resource/celex/32011R0142"]


@pytest.mark.asyncio
async def test_fetch_rejects_oversize_nontext_and_challenge_responses() -> None:
    responses = iter(
        [
            ("text/plain", b"0123456789"),
            ("application/pdf", b"pdf"),
            ("text/html", b"<title>Just a moment...</title> checking your browser"),
        ]
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        content_type, content = next(responses)
        return httpx.Response(
            200,
            headers={"content-type": content_type},
            content=content,
            request=request,
        )

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=False
    ) as client:
        with pytest.raises(ValueError, match="size limit"):
            await subject.fetch_direct_source(
                "https://example.org/large", maximum_bytes=5, client=client
            )
        with pytest.raises(ValueError, match="not textual"):
            await subject.fetch_direct_source("https://example.org/file", client=client)
        with pytest.raises(ValueError, match="access challenge"):
            await subject.fetch_direct_source("https://example.org/challenge", client=client)


@pytest.mark.asyncio
async def test_fetch_rejects_private_dns_before_network(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def private(_hostname: str) -> tuple[str, ...]:
        return ()

    monkeypatch.setattr(subject, "_resolve_public_addresses", private)

    async def handler(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("network must not be reached")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="unsafe direct source host"):
            await subject.fetch_direct_source("https://example.org", client=client)


@pytest.mark.asyncio
async def test_fetch_rejects_private_address_used_by_live_connection() -> None:
    class PrivatePeer:
        def get_extra_info(self, key: str):
            return ("10.0.0.8", 443) if key == "server_addr" else None

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            text="must not be accepted",
            request=request,
            extensions={"network_stream": PrivatePeer()},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="unsafe direct source connection peer"):
            await subject.fetch_direct_source("https://example.org", client=client)


@pytest.mark.asyncio
async def test_pinned_backend_connects_only_to_approved_numeric_address() -> None:
    calls: list[tuple[str, int]] = []
    expected_stream = object()

    class RecordingBackend:
        async def connect_tcp(self, *, host: str, port: int, **_kwargs):
            calls.append((host, port))
            return expected_stream

        async def sleep(self, _seconds: float) -> None:
            return None

    backend = subject._PinnedNetworkBackend(
        "publisher.example",
        ("93.184.216.34",),
        backend=RecordingBackend(),
    )

    stream = await backend.connect_tcp("publisher.example", 443)

    assert stream is expected_stream
    assert calls == [("93.184.216.34", 443)]


@pytest.mark.asyncio
async def test_pinned_connection_keeps_origin_hostname_for_tls_verification() -> None:
    connect_calls: list[tuple[str, int]] = []
    tls_calls: list[tuple[str | None, bool, ssl.VerifyMode]] = []

    class CapturingStream(httpcore.AsyncNetworkStream):
        def __init__(self) -> None:
            self._reads = [
                b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok",
                b"",
            ]

        async def read(self, _max_bytes: int, timeout: float | None = None) -> bytes:
            return self._reads.pop(0)

        async def write(self, _buffer: bytes, timeout: float | None = None) -> None:
            return None

        async def aclose(self) -> None:
            return None

        async def start_tls(
            self,
            ssl_context: ssl.SSLContext,
            server_hostname: str | None = None,
            timeout: float | None = None,
        ) -> httpcore.AsyncNetworkStream:
            tls_calls.append(
                (server_hostname, ssl_context.check_hostname, ssl_context.verify_mode)
            )
            return self

        def get_extra_info(self, info: str):
            if info == "server_addr":
                return ("93.184.216.34", 443)
            if info == "is_readable":
                return bool(self._reads)
            return None

    stream = CapturingStream()

    class RecordingBackend(httpcore.AsyncNetworkBackend):
        async def connect_tcp(
            self,
            host: str,
            port: int,
            timeout: float | None = None,
            local_address: str | None = None,
            socket_options=None,
        ) -> httpcore.AsyncNetworkStream:
            connect_calls.append((host, port))
            return stream

        async def connect_unix_socket(self, *args, **kwargs):
            raise AssertionError("Unix sockets must not be used")

        async def sleep(self, _seconds: float) -> None:
            return None

    pool = httpcore.AsyncConnectionPool(
        ssl_context=httpx.create_ssl_context(verify=True, trust_env=False),
        max_connections=1,
        max_keepalive_connections=0,
        network_backend=subject._PinnedNetworkBackend(
            "publisher.example",
            ("93.184.216.34",),
            backend=RecordingBackend(),
        ),
    )
    try:
        response = await pool.handle_async_request(
            httpcore.Request(
                "GET",
                "https://publisher.example/rule",
                headers=[(b"host", b"publisher.example")],
            )
        )
        assert b"".join([part async for part in response.aiter_stream()]) == b"ok"
        await response.aclose()
    finally:
        await pool.aclose()

    assert connect_calls == [("93.184.216.34", 443)]
    assert tls_calls == [("publisher.example", True, ssl.CERT_REQUIRED)]


@pytest.mark.asyncio
async def test_pinned_backend_rejects_mismatch_and_private_address_before_send() -> None:
    calls: list[str] = []

    class RecordingBackend:
        async def connect_tcp(self, *, host: str, **_kwargs):
            calls.append(host)
            return object()

        async def sleep(self, _seconds: float) -> None:
            return None

    with pytest.raises(ValueError, match="unsafe direct source address"):
        subject._PinnedNetworkBackend(
            "publisher.example",
            ("10.0.0.8",),
            backend=RecordingBackend(),
        )

    backend = subject._PinnedNetworkBackend(
        "publisher.example",
        ("93.184.216.34",),
        backend=RecordingBackend(),
    )
    with pytest.raises(httpcore.ConnectError, match="host mismatch"):
        await backend.connect_tcp("attacker.example", 443)
    with pytest.raises(httpcore.ConnectError, match="host mismatch"):
        await backend.connect_tcp("publisher.example", 80)

    assert calls == []


@pytest.mark.asyncio
async def test_fetch_rejects_encoded_response_before_body_expansion() -> None:
    body_was_read = False

    class ExplodingEncodedBody(httpx.AsyncByteStream):
        async def __aiter__(self):
            nonlocal body_was_read
            body_was_read = True
            raise AssertionError("encoded body must not be read")
            yield b""  # pragma: no cover

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["accept-encoding"] == "identity"
        return httpx.Response(
            200,
            headers={
                "content-type": "text/plain",
                "content-encoding": "gzip",
            },
            stream=ExplodingEncodedBody(),
            request=request,
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError, match="encoded responses are disabled"):
            await subject.fetch_direct_source("https://example.org", client=client)

    assert body_was_read is False
