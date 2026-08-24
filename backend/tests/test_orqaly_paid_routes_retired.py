"""Direct Orqaly paid simulation starters cannot bypass accepted scope."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException

import backend.api.routes.orqaly_integration as routes


@pytest.mark.asyncio
async def test_all_direct_paid_starters_return_gone_before_provider_work(monkeypatch):
    calls: list[str] = []

    async def forbidden(*_args, **_kwargs):
        calls.append("provider")
        raise AssertionError("retired route reached paid provider work")

    monkeypatch.setattr(routes.orchestrator, "parse_raw_questionnaire", forbidden)
    monkeypatch.setattr(routes.orchestrator, "simulate_with_persistence", forbidden)
    monkeypatch.setattr(routes.orchestrator, "get_simulation_progress", forbidden)
    monkeypatch.setattr(routes, "get_completed_simulation", forbidden)
    request = SimpleNamespace(raw_questionnaire_content="start paid work")
    user = SimpleNamespace(user_id="axwise-user")

    invocations = (
        routes.orqaly_simulate_enhanced_async(
            request,
            "service-key",
            "idempotency-key",
            "request-id",
            None,
        ),
        routes.orqaly_simulate_async(request, BackgroundTasks(), user),
        routes.orqaly_simulate_enhanced(request, user),
        routes.orqaly_get_simulation_progress("legacy-simulation", user),
        routes.orqaly_get_completed_simulation("legacy-simulation", user),
    )
    for invocation in invocations:
        with pytest.raises(HTTPException) as raised:
            await invocation
        assert raised.value.status_code == 410

    assert calls == []
