"""Default-off worker wiring; enabling adapters never authorizes an operation."""

from __future__ import annotations

from typing import Any


def capability_generator_options(flag: str | None, api_key: str) -> dict[str, Any]:
    if flag is None or flag == "" or flag == "false":
        return {}
    if type(flag) is not str or flag != "true":
        raise RuntimeError("AXWISE_CAPABILITY_GENERATORS_ENABLED must be true or false")

    # Import/construct only on explicit opt-in. The adapters do not create SDK
    # clients or transports until an exact owner-reviewed processing permit.
    from backend.services.workflow_v2.capability_providers import (
        GoogleAnalysisGenerator,
        GoogleSimulationGenerator,
    )

    return {
        "analysis_generator": GoogleAnalysisGenerator(api_key),
        "simulation_generator": GoogleSimulationGenerator(api_key),
    }
