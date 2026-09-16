from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import httpx
import pytest

from backend.domain.workflow_v2.contracts import canonical_json
from backend.services.generative.searxng_search_service import SearxngSearchService


pytestmark = pytest.mark.contract


@pytest.mark.parametrize(
    "payload",
    [
        {"results": {}},
        {"results": ["not-a-result-row"]},
        {"results": [{"title": "Cleartext", "url": "http://example.test"}]},
    ],
)
def test_malformed_discovery_response_is_not_reported_as_healthy_empty(
    payload: dict,
) -> None:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = payload
    response.status_code = 200

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ):
        result = SearxngSearchService("https://search.example.run.app").search_web_general(
            "bounded accepted-scope query"
        )

    assert result["search_performed"] is False
    assert result["runtime_diagnostics"]["status"] in {
        "error",
        "response_processing_error",
    }


def test_adapter_preserves_bounded_rows_for_downstream_authority_filtering() -> None:
    response = MagicMock()
    response.raise_for_status.return_value = None
    response.json.return_value = {
        "results": [
            {
                "title": f"Generic result {index}",
                "url": f"https://generic-{index}.example.org/source",
                "content": f"Generic discovery snippet {index}.",
            }
            for index in range(35)
        ]
    }
    response.status_code = 200
    response.content = b"bounded discovery response"

    with patch(
        "backend.services.generative.searxng_search_service.httpx.get",
        return_value=response,
    ):
        result = SearxngSearchService(
            "https://search.example.run.app"
        ).search_web_general("bounded accepted-scope query")

    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["runtime_diagnostics"]["result_count"] == 30
    assert len(result["sources"]) == 30
    assert result["sources"][10]["url"] == (
        "https://generic-10.example.org/source"
    )
    assert result["sources"][-1]["url"] == (
        "https://generic-29.example.org/source"
    )


@pytest.mark.asyncio
async def test_async_adapter_requests_the_bounded_json_search_endpoint() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "title": "Estonian Agriculture Authority",
                        "url": "https://pta.agri.ee/pet-food-rules",
                        "content": "The exact public-source passage.",
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return real_async_client(transport=transport, **kwargs)

    service = SearxngSearchService("https://search.example.run.app")
    with patch(
        "backend.services.generative.searxng_search_service.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        result = await service.search_web_general_async(
            "bounded accepted-scope query"
        )

    assert result["runtime_diagnostics"]["status"] == "ok"
    assert result["search_performed"] is True
    assert [source["url"] for source in result["sources"]] == [
        "https://pta.agri.ee/pet-food-rules"
    ]
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "GET"
    assert str(request.url.copy_with(query=None)) == (
        "https://search.example.run.app/search"
    )
    assert request.url.params["q"] == "bounded accepted-scope query"
    assert request.url.params["format"] == "json"
    assert request.url.params["categories"] == "general"
    assert request.url.params["safesearch"] == "1"
    assert "Authorization" not in request.headers


@pytest.mark.asyncio
async def test_async_adapter_cancels_the_in_flight_http_request() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def handler(_request: httpx.Request) -> httpx.Response:
        started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return real_async_client(transport=transport, **kwargs)

    service = SearxngSearchService("https://search.example.run.app")
    with patch(
        "backend.services.generative.searxng_search_service.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        search = asyncio.create_task(
            service.search_web_general_async("bounded accepted-scope query")
        )
        await started.wait()
        search.cancel()
        with pytest.raises(asyncio.CancelledError):
            await search

    assert cancelled.is_set()


@pytest.mark.asyncio
async def test_async_cloud_run_auth_uses_metadata_audience_without_query_leak() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "metadata.google.internal":
            return httpx.Response(
                200,
                text="audience-bound-token",
                headers={"Metadata-Flavor": "Google"},
            )
        return httpx.Response(200, json={"results": []})

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return real_async_client(transport=transport, **kwargs)

    service = SearxngSearchService(
        "https://search.example.run.app",
        auth_mode="google_identity",
    )
    with patch(
        "backend.services.generative.searxng_search_service.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        result = await service.search_web_general_async(
            "sensitive bounded accepted-scope query"
        )

    assert result["runtime_diagnostics"]["status"] == "empty"
    assert len(requests) == 2
    metadata, search = requests
    assert metadata.headers["Metadata-Flavor"] == "Google"
    assert metadata.url.params["audience"] == "https://search.example.run.app"
    assert "sensitive" not in str(metadata.url)
    assert search.headers["Authorization"] == "Bearer audience-bound-token"
    assert search.url.params["q"] == "sensitive bounded accepted-scope query"


@pytest.mark.asyncio
async def test_async_cloud_run_auth_rejects_unverified_metadata_response() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, text="unverified-token")

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return real_async_client(transport=transport, **kwargs)

    service = SearxngSearchService(
        "https://search.example.run.app",
        auth_mode="google_identity",
    )
    with patch(
        "backend.services.generative.searxng_search_service.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        result = await service.search_web_general_async(
            "bounded accepted-scope query"
        )

    assert result["search_performed"] is False
    assert result["error"] == "RuntimeError"
    assert result["runtime_diagnostics"]["status"] == "error"
    assert len(requests) == 1
    assert requests[0].url.host == "metadata.google.internal"


@pytest.mark.asyncio
async def test_async_adapter_sanitizes_transport_errors(
    caplog: pytest.LogCaptureFixture,
) -> None:
    sensitive_query = "private launch query must not escape"
    sensitive_token = "secret-identity-token-must-not-escape"

    async def handler(_request: httpx.Request) -> httpx.Response:
        raise RuntimeError(f"{sensitive_query}; bearer={sensitive_token}")

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(**kwargs):
        return real_async_client(transport=transport, **kwargs)

    service = SearxngSearchService("https://search.example.run.app")
    caplog.set_level(
        "WARNING",
        logger="backend.services.generative.searxng_search_service",
    )
    with patch(
        "backend.services.generative.searxng_search_service.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        result = await service.search_web_general_async(sensitive_query)

    assert result["search_performed"] is False
    assert result["error"] == "RuntimeError"
    serialized = canonical_json(result)
    assert sensitive_query not in serialized
    assert sensitive_token not in serialized
    assert sensitive_query not in caplog.text
    assert sensitive_token not in caplog.text
