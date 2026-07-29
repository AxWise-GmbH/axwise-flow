"""Deployment-receipt contract for the AxWise health endpoint."""

from __future__ import annotations

import pytest

from backend.api.app import health_check


pytestmark = pytest.mark.contract


@pytest.mark.asyncio
async def test_health_exposes_service_version_and_serving_revision(monkeypatch):
    monkeypatch.setenv("AXWISE_BUILD_REVISION", "revision-test")

    payload = await health_check()

    assert payload["status"] == "healthy"
    assert payload["service"] == "axwise-cognitive-decision-api"
    assert payload["version"] == "1.0.0"
    assert payload["revision"] == "revision-test"
    assert payload["timestamp"]
