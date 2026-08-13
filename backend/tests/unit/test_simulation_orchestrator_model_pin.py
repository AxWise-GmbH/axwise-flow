import pytest

from backend.api.research.simulation_bridge.services.orchestrator import (
    SimulationOrchestrator,
)


pytestmark = pytest.mark.contract


def test_simulation_orchestrator_uses_deployment_pinned_gemini_model(
    monkeypatch,
) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "models/gemini-3.7-flash")

    orchestrator = SimulationOrchestrator(use_parallel=False)

    assert orchestrator.model is not None
    assert orchestrator.model.model_name == "models/gemini-3.7-flash"


def test_simulation_orchestrator_defaults_to_gemini_3_7_flash(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.delenv("GEMINI_MODEL", raising=False)

    orchestrator = SimulationOrchestrator(use_parallel=False)

    assert orchestrator.model is not None
    assert orchestrator.model.model_name == "models/gemini-3.7-flash"
