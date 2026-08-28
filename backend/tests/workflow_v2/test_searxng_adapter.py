from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

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
