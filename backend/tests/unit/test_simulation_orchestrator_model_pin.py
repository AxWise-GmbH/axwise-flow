import inspect
import importlib

import pytest
from fastapi.params import Depends

from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)


pytestmark = pytest.mark.contract


def test_simulation_orchestrator_uses_deployment_pinned_gemini_model(
    monkeypatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.8-flash")

    orchestrator = SimulationOrchestrator(use_parallel=False)

    assert orchestrator.model is not None
    assert orchestrator.model.model_name == "models/gemini-3.8-flash"


def test_simulation_orchestrator_defaults_to_gemini_3_7_flash(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

    orchestrator = SimulationOrchestrator(use_parallel=False)

    assert orchestrator.model is not None
    assert orchestrator.model.model_name == "models/gemini-3.8-flash"


def test_simulation_helper_routes_use_auth_and_canonical_runtime(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.8-flash")

    router_module = importlib.import_module(
        "backend.api.research.simulation_bridge.router"
    )

    for handler in (
        router_module.test_persona_generation,
        router_module.test_interview_simulation,
    ):
        auth_default = inspect.signature(handler).parameters["_user"].default
        assert isinstance(auth_default, Depends)

    hidden_paths = {
        route.path
        for route in router_module.router.routes
        if not route.include_in_schema
    }
    assert "/api/research/simulation-bridge/test-personas" in hidden_paths
    assert "/api/research/simulation-bridge/test-interview" in hidden_paths

    model = router_module.get_gemini_model()
    assert model.model_name == "models/gemini-3.8-flash"
    assert model.settings["max_tokens"] == 65_536
