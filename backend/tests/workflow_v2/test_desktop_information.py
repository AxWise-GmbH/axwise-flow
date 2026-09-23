from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest
from fastapi import FastAPI

from backend.api.routes import desktop_information
from backend.api.routes.desktop_information import (
    InformationRequest,
    InformationService,
)

pytestmark = pytest.mark.contract


def quick_request():
    return InformationRequest(
        question="Latest local headlines",
        capability={
            "kind": "quick_info",
            "routingMode": "explicit",
            "location": "Riga",
        },
    )


def quick_stub():
    return SimpleNamespace(
        quick_info=AsyncMock(
            return_value=SimpleNamespace(
                markdown="No verified matching items.",
                sources=[],
                facts=[],
                outcome="no_verified_matches",
                cache_hit=False,
            )
        ),
        close=AsyncMock(),
    )


@pytest.mark.asyncio
async def test_missing_gemini_credentials_returns_honest_quick_failure(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    widgets = SimpleNamespace(close=AsyncMock())
    service = InformationService(widgets=widgets)
    try:
        result = await service.lookup(quick_request())
        assert result["outcome"] == "provider_unavailable"
        assert "couldn’t complete this live check" in result["response"]["markdown"]
        assert "GEMINI_API_KEY" not in str(result)
        assert service.quick is None
    finally:
        await service.close()
    widgets.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_quick_initialization_failure_is_not_http_500_and_can_retry(monkeypatch):
    quick = quick_stub()
    factory = Mock(side_effect=[ValueError("private credential details"), quick])
    monkeypatch.setattr(desktop_information, "GeminiAssistantQuickInfoRunner", factory)
    service = InformationService(widgets=SimpleNamespace(close=AsyncMock()))
    app = FastAPI()
    app.include_router(desktop_information.router)
    app.dependency_overrides[desktop_information.get_information_service] = (
        lambda: service
    )
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            body = quick_request().model_dump(by_alias=True)
            failed = await client.post("/v2/information", json=body)
            assert failed.status_code == 200
            assert failed.json()["outcome"] == "provider_unavailable"
            assert "private credential details" not in failed.text
            assert service.quick is None
            retried = await client.post("/v2/information", json=body)
            assert retried.status_code == 200
            assert retried.json()["outcome"] == "no_verified_matches"
    finally:
        await service.close()
    assert factory.call_count == 2
    quick.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_runner_is_created_on_first_quick_request_and_reused(monkeypatch):
    quick = quick_stub()
    factory = Mock(return_value=quick)
    monkeypatch.setattr(desktop_information, "GeminiAssistantQuickInfoRunner", factory)
    widgets = SimpleNamespace(close=AsyncMock())
    service = InformationService(widgets=widgets)
    factory.assert_not_called()
    await service.lookup(quick_request())
    await service.lookup(quick_request())
    factory.assert_called_once_with(verify_discovery=True)
    assert quick.quick_info.await_count == 2
    await service.close()
    await service.close()
    quick.close.assert_awaited_once()
    widgets.close.assert_awaited_once()
    assert (await service.lookup(quick_request()))["outcome"] == "provider_unavailable"
    assert quick.quick_info.await_count == 2
    factory.assert_called_once()


@pytest.mark.asyncio
async def test_typed_discovery_kind_is_forwarded_to_quick_runner():
    quick = quick_stub()
    service = InformationService(
        quick=quick, widgets=SimpleNamespace(close=AsyncMock())
    )
    request = InformationRequest(
        question="Jaunākās ziņas Rīgā",
        capability={
            "kind": "quick_info",
            "routingMode": "explicit",
            "location": "Riga",
            "discoveryKind": "news",
        },
    )

    await service.lookup(request)

    quick.quick_info.assert_awaited_once_with(
        "Jaunākās ziņas Rīgā",
        location="Riga",
        jev_enabled=False,
        discovery_kind="news",
    )
    await service.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("injected_quick", [False, True])
async def test_close_only_closes_initialized_clients(monkeypatch, injected_quick):
    factory = Mock(side_effect=AssertionError("Closing must not initialize Gemini"))
    monkeypatch.setattr(desktop_information, "GeminiAssistantQuickInfoRunner", factory)
    widgets = SimpleNamespace(close=AsyncMock())
    quick = quick_stub() if injected_quick else None
    service = InformationService(quick=quick, widgets=widgets)
    await service.close()
    await service.close()
    factory.assert_not_called()
    widgets.close.assert_awaited_once()
    if quick is not None:
        quick.close.assert_awaited_once()
