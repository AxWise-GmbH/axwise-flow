"""Bounded simulation execution through an explicitly injected generator port.

No production provider is configured here. The owning operation handler must
resolve source ownership/exact entries and processing consent before invoking
this service. Synthetic labels are not anonymization or source-access grants.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

from backend.domain.workflow_v2.capability_limits import (
    CapabilityLimitsV1,
    effective_capability_limits,
)
from backend.domain.workflow_v2.simulation import (
    SimulationCandidateV1,
    SimulationGroundingPassageV1,
    SimulationRequestV1,
    SimulationSlotV1,
    SimulationV1,
    build_simulation,
    simulation_plan,
    validate_simulation_grounding,
)
from backend.domain.workflow_v2.transcript_corpus import CorpusArtifactRefV1

SIMULATION_POLICY = CapabilityLimitsV1.model_validate(
    {
        "deadlineMs": 180_000,
        "maxModelCalls": 3,
        "maxInputTokens": 120_000,
        "maxOutputTokens": 65_536,
    }
)


class SimulationExecutionError(RuntimeError):
    """Safe finite code; provider messages and source bodies are not diagnostics."""

    def __init__(self, code: str):
        if code not in {
            "AXWISE_SIMULATION_INVALID_INPUT",
            "AXWISE_SIMULATION_GENERATOR_UNAVAILABLE",
            "AXWISE_SIMULATION_DEADLINE",
            "AXWISE_SIMULATION_INVALID_OUTPUT",
            "AXWISE_SIMULATION_INVALID_USAGE",
            "AXWISE_SIMULATION_BUDGET_EXCEEDED",
            "AXWISE_SIMULATION_PROVIDER_FAILED",
        }:
            raise ValueError("unrecognized simulation failure code")
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class SimulationGenerationContext:
    request: SimulationRequestV1
    operation_id: UUID
    accepted_scope: CorpusArtifactRefV1
    grounding: tuple[SimulationGroundingPassageV1, ...] = ()


@dataclass(frozen=True)
class SimulationGenerationResult:
    candidate: SimulationCandidateV1
    model_calls: int
    input_tokens: int | None = None
    output_tokens: int | None = None
    model_version: str | None = None


@dataclass(frozen=True)
class SimulationExecutionResult:
    artifact: SimulationV1
    latency_ms: int
    model_calls: int
    input_tokens: int | None
    output_tokens: int | None
    model_version: str | None


class SimulationGenerator(Protocol):
    async def generate(
        self,
        context: SimulationGenerationContext,
        plan: tuple[SimulationSlotV1, ...],
        *,
        limits: CapabilityLimitsV1,
        deadline: float,
    ) -> SimulationGenerationResult: ...


class SimulationService:
    def __init__(
        self,
        generator: SimulationGenerator | None,
        *,
        policy: CapabilityLimitsV1 = SIMULATION_POLICY,
    ):
        self.generator = generator
        self.policy = CapabilityLimitsV1.model_validate(policy)

    async def run(
        self, context: SimulationGenerationContext, *, limits: CapabilityLimitsV1
    ) -> SimulationExecutionResult:
        started = asyncio.get_running_loop().time()
        try:
            effective = effective_capability_limits(limits, self.policy)
            request = SimulationRequestV1.model_validate(context.request)
            scope = CorpusArtifactRefV1.model_validate(context.accepted_scope)
            if scope.kind != "scope":
                raise ValueError("accepted scope required")
            operation_id = UUID(str(context.operation_id))
            grounding = validate_simulation_grounding(request, context.grounding)
            admitted = SimulationGenerationContext(
                request, operation_id, scope, grounding
            )
            plan = simulation_plan(request, operation_id=operation_id)
        except (AttributeError, TypeError, ValueError, OverflowError) as error:
            raise SimulationExecutionError("AXWISE_SIMULATION_INVALID_INPUT") from error
        deadline = started + effective.deadline_ms / 1000
        if asyncio.get_running_loop().time() >= deadline:
            raise SimulationExecutionError("AXWISE_SIMULATION_DEADLINE")
        if self.generator is None:
            raise SimulationExecutionError("AXWISE_SIMULATION_GENERATOR_UNAVAILABLE")
        try:
            async with asyncio.timeout_at(deadline):
                generated = await self.generator.generate(
                    admitted, plan, limits=effective, deadline=deadline
                )
                # An injected generator can suppress CancelledError. A cancelled
                # operation must still never publish its returned candidate.
                current = asyncio.current_task()
                if current is not None and current.cancelling():
                    raise asyncio.CancelledError
                if type(generated) is not SimulationGenerationResult:
                    raise SimulationExecutionError("AXWISE_SIMULATION_INVALID_OUTPUT")
                if type(generated.model_calls) is not int or generated.model_calls < 1:
                    raise SimulationExecutionError("AXWISE_SIMULATION_INVALID_USAGE")
                if generated.model_calls > effective.max_model_calls:
                    raise SimulationExecutionError("AXWISE_SIMULATION_BUDGET_EXCEEDED")
                for value, maximum in (
                    (generated.input_tokens, effective.max_input_tokens),
                    (generated.output_tokens, effective.max_output_tokens),
                ):
                    if value is not None and (type(value) is not int or value < 0):
                        raise SimulationExecutionError(
                            "AXWISE_SIMULATION_INVALID_USAGE"
                        )
                    if value is not None and value > maximum:
                        raise SimulationExecutionError(
                            "AXWISE_SIMULATION_BUDGET_EXCEEDED"
                        )
                if generated.model_version is not None and (
                    type(generated.model_version) is not str
                    or re.fullmatch(r"[A-Za-z0-9_.:/-]{1,160}", generated.model_version)
                    is None
                ):
                    raise SimulationExecutionError("AXWISE_SIMULATION_INVALID_USAGE")
                try:
                    artifact = build_simulation(
                        generated.candidate,
                        request=request,
                        operation_id=operation_id,
                        accepted_scope=scope,
                        admitted_grounding=grounding,
                    )
                except (TypeError, ValueError, OverflowError) as error:
                    raise SimulationExecutionError(
                        "AXWISE_SIMULATION_INVALID_OUTPUT"
                    ) from error
                if asyncio.get_running_loop().time() >= deadline:
                    raise SimulationExecutionError("AXWISE_SIMULATION_DEADLINE")
                if current is not None and current.cancelling():
                    raise asyncio.CancelledError
                return SimulationExecutionResult(
                    artifact=artifact,
                    latency_ms=max(
                        0, round((asyncio.get_running_loop().time() - started) * 1000)
                    ),
                    model_calls=generated.model_calls,
                    input_tokens=generated.input_tokens,
                    output_tokens=generated.output_tokens,
                    model_version=generated.model_version,
                )
        except asyncio.CancelledError:
            raise
        except TimeoutError as error:
            raise SimulationExecutionError("AXWISE_SIMULATION_DEADLINE") from error
        except SimulationExecutionError:
            raise
        except Exception as error:
            raise SimulationExecutionError(
                "AXWISE_SIMULATION_PROVIDER_FAILED"
            ) from error


__all__ = [
    "SIMULATION_POLICY",
    "SimulationExecutionError",
    "SimulationGenerationContext",
    "SimulationGenerationResult",
    "SimulationExecutionResult",
    "SimulationGenerator",
    "SimulationService",
]
