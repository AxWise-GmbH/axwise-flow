"""Execution budgets and cancellation with offline injected generators only."""

import asyncio
from dataclasses import replace
from uuid import UUID

import pytest

from backend.domain.workflow_v2.capability_limits import CapabilityLimitsV1
from backend.domain.workflow_v2.simulation import (
    SimulationCandidateV1,
    SimulationRequestV1,
)
from backend.domain.workflow_v2.transcript_corpus import CorpusArtifactRefV1
from backend.services.workflow_v2.simulation_service import (
    SIMULATION_POLICY,
    SimulationExecutionError,
    SimulationGenerationContext,
    SimulationGenerationResult,
    SimulationService,
)
from backend.tests.workflow_v2.test_simulation_contracts import (
    OPERATION,
    SCOPE,
    SOURCE,
    candidate,
    passage,
    request,
)

pytestmark = pytest.mark.contract


def context(value=None, *, grounding=()):
    value = value or request()
    return SimulationGenerationContext(
        SimulationRequestV1.model_validate(value),
        UUID(OPERATION),
        CorpusArtifactRefV1.model_validate(SCOPE),
        tuple(grounding),
    )


class Generator:
    def __init__(self, *, output=None, error=None):
        self.calls = []
        self.output = output
        self.error = error

    async def generate(self, supplied, plan, *, limits, deadline):
        self.calls.append((supplied, plan, limits, deadline))
        if self.error:
            raise self.error
        return self.output or SimulationGenerationResult(
            SimulationCandidateV1.model_validate(candidate(supplied.request)),
            1,
        )


@pytest.mark.asyncio
async def test_unknown_usage_stays_unknown_and_complete_artifact_is_bound():
    generator = Generator()
    result = await SimulationService(generator).run(context(), limits=SIMULATION_POLICY)
    assert (
        result.input_tokens is None
        and result.output_tokens is None
        and result.model_version is None
    )
    assert result.model_calls == 1 and result.latency_ms >= 0
    assert (
        result.artifact.origin == "synthetic"
        and result.artifact.operation_id == UUID(OPERATION)
    )
    assert len(generator.calls) == 1
    supplied, plan, limits, deadline = generator.calls[0]
    assert supplied.request == context().request and len(plan) == 1
    assert limits == SIMULATION_POLICY and deadline > 0


@pytest.mark.asyncio
async def test_effective_budget_is_minimum_of_request_and_server_policy():
    limits = CapabilityLimitsV1.model_validate(
        {
            "deadlineMs": 900000,
            "maxModelCalls": 32,
            "maxInputTokens": 2000000,
            "maxOutputTokens": 2000000,
        }
    )
    generator = Generator()
    await SimulationService(generator).run(context(), limits=limits)
    assert generator.calls[0][2] == SIMULATION_POLICY
    low = limits.model_copy(
        update={"max_model_calls": 1, "max_input_tokens": 20, "max_output_tokens": 30}
    )
    await SimulationService(generator).run(context(), limits=low)
    assert generator.calls[1][2].max_model_calls == 1
    assert (
        generator.calls[1][2].max_input_tokens == 20
        and generator.calls[1][2].max_output_tokens == 30
    )


@pytest.mark.asyncio
async def test_missing_grounding_or_invalid_intent_fails_before_generator():
    raw = request()
    raw["grounding"] = {"mode": "source_grounded", "sourceArtifacts": [SOURCE]}
    generator = Generator()
    with pytest.raises(SimulationExecutionError, match="INVALID_INPUT"):
        await SimulationService(generator).run(context(raw), limits=SIMULATION_POLICY)
    forged = context().request.model_copy(update={"requested": False})
    with pytest.raises(SimulationExecutionError, match="INVALID_INPUT"):
        await SimulationService(generator).run(
            replace(context(), request=forged), limits=SIMULATION_POLICY
        )
    assert generator.calls == []


@pytest.mark.asyncio
async def test_grounding_reaches_the_generator_once_and_is_bound_to_result():
    raw = request()
    raw["grounding"] = {"mode": "source_grounded", "sourceArtifacts": [SOURCE]}
    generator = Generator()
    result = await SimulationService(generator).run(
        context(raw, grounding=[passage()]), limits=SIMULATION_POLICY
    )
    assert len(generator.calls[0][0].grounding) == 1
    assert result.artifact.grounding.status == "applied"
    assert result.artifact.source_artifacts[0].artifact_hash == SOURCE["artifactHash"]


@pytest.mark.asyncio
async def test_unconfigured_generator_is_explicitly_disabled():
    with pytest.raises(SimulationExecutionError, match="GENERATOR_UNAVAILABLE"):
        await SimulationService(None).run(context(), limits=SIMULATION_POLICY)


@pytest.mark.parametrize(
    "field,value,code",
    [
        ("model_calls", True, "INVALID_USAGE"),
        ("model_calls", None, "INVALID_USAGE"),
        ("model_calls", 0, "INVALID_USAGE"),
        ("model_calls", 4, "BUDGET_EXCEEDED"),
        ("input_tokens", True, "INVALID_USAGE"),
        ("input_tokens", -1, "INVALID_USAGE"),
        ("input_tokens", 120001, "BUDGET_EXCEEDED"),
        ("output_tokens", 65537, "BUDGET_EXCEEDED"),
        ("output_tokens", 1.0, "INVALID_USAGE"),
        ("model_version", "secret\nbody", "INVALID_USAGE"),
    ],
)
@pytest.mark.asyncio
async def test_invalid_or_excess_usage_does_not_publish(field, value, code):
    valid = SimulationGenerationResult(
        SimulationCandidateV1.model_validate(candidate(request())), 1
    )
    generator = Generator(output=replace(valid, **{field: value}))
    with pytest.raises(SimulationExecutionError, match=code):
        await SimulationService(generator).run(context(), limits=SIMULATION_POLICY)
    assert len(generator.calls) == 1


@pytest.mark.asyncio
async def test_known_zero_token_usage_remains_a_reported_zero():
    valid = SimulationGenerationResult(
        SimulationCandidateV1.model_validate(candidate(request())),
        1,
        0,
        0,
        "synthetic-test-model",
    )
    result = await SimulationService(Generator(output=valid)).run(
        context(), limits=SIMULATION_POLICY
    )
    assert result.input_tokens == result.output_tokens == 0


@pytest.mark.asyncio
async def test_partial_output_is_a_failure_not_partial_completed_cohort():
    raw = candidate(request(participants=2))
    raw["interviews"].pop()
    generated = SimulationGenerationResult(SimulationCandidateV1.model_validate(raw), 1)
    with pytest.raises(SimulationExecutionError, match="INVALID_OUTPUT"):
        await SimulationService(Generator(output=generated)).run(
            context(request(participants=2)), limits=SIMULATION_POLICY
        )


@pytest.mark.asyncio
async def test_provider_failure_has_safe_code_and_no_retry():
    generator = Generator(
        error=RuntimeError(
            "private transcript and token should never be the public code"
        )
    )
    with pytest.raises(SimulationExecutionError, match="PROVIDER_FAILED") as error:
        await SimulationService(generator).run(context(), limits=SIMULATION_POLICY)
    assert (
        str(error.value) == "AXWISE_SIMULATION_PROVIDER_FAILED"
        and len(generator.calls) == 1
    )


class WaitingGenerator:
    def __init__(self):
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def generate(self, *args, **kwargs):
        self.started.set()
        try:
            await asyncio.Event().wait()
        finally:
            self.cancelled.set()


@pytest.mark.asyncio
async def test_external_cancellation_stops_subordinate_generator():
    generator = WaitingGenerator()
    task = asyncio.create_task(
        SimulationService(generator).run(context(), limits=SIMULATION_POLICY)
    )
    await generator.started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert generator.cancelled.is_set()


@pytest.mark.asyncio
async def test_one_deadline_covers_generation_and_cancels_waiting_work():
    generator = WaitingGenerator()
    limits = SIMULATION_POLICY.model_copy(update={"deadline_ms": 20})
    with pytest.raises(SimulationExecutionError, match="DEADLINE"):
        await SimulationService(generator).run(context(), limits=limits)
    assert generator.cancelled.is_set()


class CancellationSuppressingGenerator(WaitingGenerator):
    async def generate(self, supplied, plan, *, limits, deadline):
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
        return SimulationGenerationResult(
            SimulationCandidateV1.model_validate(candidate(supplied.request)), 1
        )


@pytest.mark.asyncio
async def test_suppressed_external_cancellation_cannot_publish_a_candidate():
    generator = CancellationSuppressingGenerator()
    task = asyncio.create_task(
        SimulationService(generator).run(context(), limits=SIMULATION_POLICY)
    )
    await generator.started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert generator.cancelled.is_set() and task.cancelled()


@pytest.mark.asyncio
async def test_suppressed_deadline_cancellation_cannot_publish_a_candidate():
    generator = CancellationSuppressingGenerator()
    limits = SIMULATION_POLICY.model_copy(update={"deadline_ms": 20})
    with pytest.raises(SimulationExecutionError, match="DEADLINE"):
        await SimulationService(generator).run(context(), limits=limits)
    assert generator.cancelled.is_set()
