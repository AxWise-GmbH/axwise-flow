"""Offline opt-in wiring tests: no real SDK, transport, or operation call."""

import pytest

from backend.services.workflow_v2.capability_provider_config import capability_generator_options
from backend.services.workflow_v2 import capability_providers as providers

pytestmark = pytest.mark.contract


@pytest.mark.parametrize("flag", [None, "", "false"])
def test_default_off_does_not_construct_capability_adapters(monkeypatch, flag):
    def forbidden(*args, **kwargs):
        raise AssertionError("disabled adapters must not be constructed")
    monkeypatch.setattr(providers, "GoogleAnalysisGenerator", forbidden)
    monkeypatch.setattr(providers, "GoogleSimulationGenerator", forbidden)
    assert capability_generator_options(flag, "") == {}


@pytest.mark.parametrize("flag", ["1", "yes", "TRUE", "False", " true", True, False, 0])
def test_invalid_opt_in_is_fail_closed(flag):
    with pytest.raises(RuntimeError, match="AXWISE_CAPABILITY_GENERATORS_ENABLED"):
        capability_generator_options(flag, "synthetic-only")


def test_explicit_opt_in_only_constructs_lazy_adapters(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("wiring must not construct a provider client or transport")
    monkeypatch.setattr(providers, "GoogleGenAIClient", forbidden)
    monkeypatch.setattr(providers, "_new_http_transport", forbidden)
    options = capability_generator_options("true", "synthetic-only")
    assert set(options) == {"analysis_generator", "simulation_generator"}
    assert isinstance(options["analysis_generator"], providers.GoogleAnalysisGenerator)
    assert isinstance(options["simulation_generator"], providers.GoogleSimulationGenerator)
