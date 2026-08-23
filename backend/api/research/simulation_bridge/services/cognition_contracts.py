"""Shared wall-clock contracts for simulation cognition stages."""

from __future__ import annotations

import asyncio
import math
import os
from typing import Awaitable, Callable, TypeVar


COGNITION_STAGE_TIMEOUT_SECONDS = 900.0
COGNITION_STAGE_TIMEOUT_ENV = "AXWISE_COGNITION_STAGE_TIMEOUT_SECONDS"
COGNITION_STAGE_TIMEOUT_OVERRIDES = {
    "company_discovery": "AXWISE_COMPANY_DISCOVERY_STAGE_TIMEOUT_SECONDS",
    "questionnaire": "AXWISE_QUESTIONNAIRE_STAGE_TIMEOUT_SECONDS",
    "stakeholders": "AXWISE_STAKEHOLDER_STAGE_TIMEOUT_SECONDS",
    "personas": "AXWISE_PERSONA_STAGE_TIMEOUT_SECONDS",
    "interviews": "AXWISE_INTERVIEW_STAGE_TIMEOUT_SECONDS",
    "insights": "AXWISE_INSIGHTS_STAGE_TIMEOUT_SECONDS",
}
_StageResult = TypeVar("_StageResult")


class IncompleteSimulationCohortError(RuntimeError):
    """Raised when a simulation cannot satisfy its declared cohort contract."""


class CognitionStageTimeoutError(TimeoutError):
    """Raised when a whole cognition stage exceeds its wall-clock budget."""


def cognition_stage_timeout_seconds(stage: str) -> float:
    """Resolve a finite, positive whole-stage deadline from the environment."""

    override_name = COGNITION_STAGE_TIMEOUT_OVERRIDES.get(stage)
    raw_value = (
        os.getenv(override_name) if override_name else None
    ) or os.getenv(
        COGNITION_STAGE_TIMEOUT_ENV,
        str(COGNITION_STAGE_TIMEOUT_SECONDS),
    )
    try:
        seconds = float(raw_value)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{override_name or COGNITION_STAGE_TIMEOUT_ENV} must be a number"
        ) from exc
    if not math.isfinite(seconds) or seconds <= 0:
        raise ValueError(
            f"{override_name or COGNITION_STAGE_TIMEOUT_ENV} must be finite and positive"
        )
    return seconds


async def run_cognition_stage(
    stage: str,
    operation: Callable[[], Awaitable[_StageResult]],
) -> _StageResult:
    """Bound an entire Agent stage, including all semantic output repairs."""

    timeout_seconds = cognition_stage_timeout_seconds(stage)
    timeout_context = asyncio.timeout(timeout_seconds)
    try:
        async with timeout_context:
            return await operation()
    except TimeoutError as exc:
        if not timeout_context.expired():
            raise
        raise CognitionStageTimeoutError(
            f"{stage} cognition stage exceeded {timeout_seconds:g} seconds"
        ) from exc
