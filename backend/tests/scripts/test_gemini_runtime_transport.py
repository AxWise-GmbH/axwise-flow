"""Behavioral contracts for the PydanticAI Gemini transport."""

from __future__ import annotations

import asyncio

import httpx
import pytest
from google.genai.types import ThinkingLevel

from backend.services.llm.gemini_runtime import (
    BoundedRetryAsyncClient,
    build_research_model,
    close_shared_research_model,
    get_shared_research_model,
)


pytestmark = pytest.mark.contract


def test_remote_protocol_disconnect_retries_same_request() -> None:
    calls: list[bytes] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(await request.aread())
        if len(calls) == 1:
            raise httpx.RemoteProtocolError(
                "Server disconnected without sending a response",
                request=request,
            )
        return httpx.Response(200, json={"ok": True})

    async def exercise() -> None:
        async with BoundedRetryAsyncClient(
            transport=httpx.MockTransport(handler),
            attempts=3,
            operation_seconds=1.0,
            initial_delay=0.0,
            jitter=0.0,
        ) as client:
            response = await client.post("https://example.test/model", json={"x": 1})
            assert response.json() == {"ok": True}

    asyncio.run(exercise())
    assert len(calls) == 2
    assert calls[0] == calls[1] == b'{"x":1}'


def test_retry_after_is_honored_for_transient_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0
    sleeps: list[float] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, headers={"Retry-After": "2"})
        return httpx.Response(200, json={"ok": True})

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("backend.services.llm.gemini_runtime.asyncio.sleep", fake_sleep)

    async def exercise() -> None:
        async with BoundedRetryAsyncClient(
            transport=httpx.MockTransport(handler),
            attempts=3,
            operation_seconds=10.0,
            initial_delay=0.1,
            jitter=0.0,
        ) as client:
            response = await client.get("https://example.test/model")
            assert response.status_code == 200

    asyncio.run(exercise())
    assert calls == 2
    assert sleeps == [2.0]


def test_non_transient_status_is_not_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={"error": "schema rejected"})

    async def exercise() -> None:
        async with BoundedRetryAsyncClient(
            transport=httpx.MockTransport(handler),
            attempts=3,
            initial_delay=0.0,
            jitter=0.0,
        ) as client:
            response = await client.get("https://example.test/model")
            assert response.status_code == 400

    asyncio.run(exercise())
    assert calls == 1


def test_transport_timeout_is_bounded_and_not_retried_past_deadline() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    async def exercise() -> None:
        async with BoundedRetryAsyncClient(
            transport=httpx.MockTransport(handler),
            attempts=3,
            operation_seconds=0.01,
            initial_delay=0.0,
            jitter=0.0,
        ) as client:
            with pytest.raises(httpx.TimeoutException):
                await client.get("https://example.test/model")

    asyncio.run(exercise())
    assert calls == 1


def test_external_cancellation_propagates_without_retry() -> None:
    calls = 0
    started = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        started.set()
        await asyncio.Event().wait()
        raise AssertionError("unreachable")

    async def exercise() -> None:
        async with BoundedRetryAsyncClient(
            transport=httpx.MockTransport(handler),
            attempts=3,
            operation_seconds=60.0,
            initial_delay=0.0,
            jitter=0.0,
        ) as client:
            request = asyncio.create_task(client.get("https://example.test/model"))
            await started.wait()
            request.cancel()
            with pytest.raises(asyncio.CancelledError):
                await request

    asyncio.run(exercise())
    assert calls == 1


def test_research_model_has_one_retry_owner_and_exact_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.8-flash")
    model = build_research_model("test-key")

    assert model.model_name == "models/gemini-3.8-flash"
    api_client = model._provider.client._api_client
    assert isinstance(api_client._async_httpx_client, BoundedRetryAsyncClient)
    assert api_client._http_options.retry_options.attempts == 1
    assert model.settings["google_thinking_config"]["thinking_level"] == (
        ThinkingLevel.HIGH
    )
    assert model.settings["max_tokens"] == 65_536


def test_shared_research_model_reuses_the_caller_owned_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.8-flash")

    first = get_shared_research_model("shared-test-key")
    second = get_shared_research_model("shared-test-key")

    assert first is second
    assert first.model_name == "models/gemini-3.8-flash"
    assert first.settings["max_tokens"] == 65_536


def test_shared_research_model_closes_the_injected_http_transport(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.8-flash")
    api_key = "shared-close-test-key"
    model = get_shared_research_model(api_key)
    transport = model.client._api_client._async_httpx_client

    assert isinstance(transport, BoundedRetryAsyncClient)
    assert transport.is_closed is False

    asyncio.run(close_shared_research_model(api_key))

    assert transport.is_closed is True
