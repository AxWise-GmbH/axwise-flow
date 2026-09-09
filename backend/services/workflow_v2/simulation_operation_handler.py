"""Owned operation admission for the explicitly injected simulation engine.

Only exact, caller-selected research claims or qualitative source quotes enter
grounding. This module configures no production model or external data transfer.
"""

from __future__ import annotations

import asyncio
import hashlib
from typing import Callable
from uuid import NAMESPACE_URL, uuid5

from backend.domain.workflow_v2.capability_limits import effective_capability_limits
from backend.domain.workflow_v2.contracts import (
    ArtifactRef,
    AxWiseOperationEnvelope,
    CapabilityOperationMetrics,
    ResearchResultV2,
    ScopeArtifactV2,
    SimulateInputV1,
    SimulationArtifactFact,
    SimulationCompletedResult,
    artifact_content_hash,
    canonical_json,
)
from backend.domain.workflow_v2.qualitative_analysis import QualitativeAnalysisV1
from backend.domain.workflow_v2.simulation import (
    SimulationGroundingPassageV1,
    simulation_plan,
    validate_simulation,
    validate_simulation_grounding,
)
from backend.domain.workflow_v2.transcript_corpus import CorpusArtifactRefV1
from backend.services.workflow_v2.analysis_service import (
    OwnedArtifactResolver,
    resolve_owned_capability_artifact,
    revalidate_capability_envelope,
)
from backend.services.workflow_v2.operation_service import CognitiveExecutionFailure
from backend.services.workflow_v2.capability_generation_payloads import (
    simulation_generation_payload,
)
from backend.services.workflow_v2.capability_processing import issue_processing_permit
from backend.services.workflow_v2.simulation_service import (
    SIMULATION_POLICY,
    SimulationExecutionError,
    SimulationGenerationContext,
    SimulationGenerator,
    SimulationService,
)


class SimulationOperationHandler:
    def __init__(
        self,
        *,
        artifact_resolver: OwnedArtifactResolver | None,
        verify_scope_authority: Callable[..., None],
        generator: SimulationGenerator | None,
    ) -> None:
        self.artifact_resolver = artifact_resolver
        self.verify_scope_authority = verify_scope_authority
        self.service = SimulationService(generator)

    async def execute(
        self, envelope: AxWiseOperationEnvelope
    ) -> SimulationCompletedResult:
        clock = asyncio.get_running_loop().time
        started = clock()
        checked = revalidate_capability_envelope(envelope)
        if not isinstance(checked.input, SimulateInputV1):
            raise CognitiveExecutionFailure(
                "AXWISE_INPUT_TYPE_MISMATCH", retryable=False
            )
        input_value = checked.input
        effective = effective_capability_limits(input_value.limits, SIMULATION_POLICY)
        deadline = started + effective.deadline_ms / 1000
        try:
            async with asyncio.timeout_at(deadline):
                scope_fact = await resolve_owned_capability_artifact(
                    self.artifact_resolver,
                    checked,
                    input_value.accepted_scope,
                    kind="scope",
                )
                if canonical_json(scope_fact.payload) != canonical_json(
                    input_value.scope.model_dump(mode="json", by_alias=True)
                ):
                    raise CognitiveExecutionFailure(
                        "AXWISE_ACCEPTED_SCOPE_MISMATCH", retryable=False
                    )
                scope = ScopeArtifactV2.model_validate(scope_fact.payload)
                self.verify_scope_authority(
                    scope,
                    tenant_id=checked.owner.tenant_id,
                    artifact_id=input_value.accepted_scope.artifact_id,
                )
                loaded = {}
                for reference in input_value.request.grounding.source_artifacts:
                    loaded[reference.artifact_id] = (
                        await resolve_owned_capability_artifact(
                            self.artifact_resolver,
                            checked,
                            ArtifactRef.model_validate(
                                reference.model_dump(mode="json", by_alias=True)
                            ),
                            kind=reference.kind,
                        )
                    )
                passages = []
                for selection in input_value.selected_grounding:
                    fact = loaded[selection.artifact.artifact_id]
                    if fact.kind == "research":
                        entries = ResearchResultV2.model_validate(
                            fact.payload
                        ).selected_claims
                        entry = next(
                            (
                                row
                                for row in entries
                                if row.claim_id == selection.entry_id
                            ),
                            None,
                        )
                    else:
                        entries = QualitativeAnalysisV1.model_validate(
                            fact.payload
                        ).quotes
                        entry = next(
                            (
                                row
                                for row in entries
                                if row.quote_id == selection.entry_id
                            ),
                            None,
                        )
                    if entry is None:
                        raise CognitiveExecutionFailure(
                            "AXWISE_SIMULATION_GROUNDING_ENTRY_NOT_FOUND",
                            retryable=False,
                        )
                    passages.append(
                        SimulationGroundingPassageV1.model_validate(
                            {
                                "artifact": selection.artifact,
                                "entryKind": selection.entry_kind,
                                "entryId": selection.entry_id,
                                "text": entry.text,
                                "textSha256": hashlib.sha256(
                                    entry.text.encode("utf-8")
                                ).hexdigest(),
                            }
                        )
                    )
                grounding = validate_simulation_grounding(input_value.request, passages)
                remaining_ms = int((deadline - clock()) * 1000)
                if remaining_ms < 1:
                    raise asyncio.TimeoutError
                context = SimulationGenerationContext(
                    request=input_value.request,
                    operation_id=checked.operation_id,
                    accepted_scope=CorpusArtifactRefV1.model_validate(
                        input_value.accepted_scope.model_dump(
                            mode="json", by_alias=True
                        )
                    ),
                    grounding=grounding,
                    processing_permit=issue_processing_permit(
                        checked,
                        deadline=deadline,
                        provider_payload=simulation_generation_payload(
                            input_value.request,
                            simulation_plan(
                                input_value.request, operation_id=checked.operation_id
                            ),
                            grounding,
                        ),
                    ),
                )
                result = await self.service.run(
                    context,
                    limits=effective.model_copy(update={"deadline_ms": remaining_ms}),
                )
                current = asyncio.current_task()
                if current is not None and current.cancelling():
                    raise asyncio.CancelledError
                artifact_payload = validate_simulation(
                    result.artifact,
                    request=input_value.request,
                    operation_id=checked.operation_id,
                    accepted_scope=context.accepted_scope,
                    admitted_grounding=grounding,
                ).model_dump(mode="json", by_alias=True)
                artifact = SimulationArtifactFact(
                    artifact_id=uuid5(
                        NAMESPACE_URL, f"axwise:{checked.operation_id}:simulation"
                    ),
                    artifact_hash=artifact_content_hash(
                        content_type="application/json",
                        payload=artifact_payload,
                        markdown=None,
                    ),
                    kind="simulation",
                    content_type="application/json",
                    payload=artifact_payload,
                    markdown=None,
                    source_artifact_ids=sorted(
                        {input_value.accepted_scope.artifact_id}
                        | {
                            ref.artifact_id
                            for ref in input_value.request.grounding.source_artifacts
                        },
                        key=str,
                    ),
                )
                completion = SimulationCompletedResult(
                    result_type="simulation_completed",
                    artifact=artifact,
                    metrics=CapabilityOperationMetrics(
                        latency_ms=max(0, round((clock() - started) * 1000)),
                        model_calls=result.model_calls,
                        budget_scope="invocation",
                        usage_complete=result.input_tokens is not None
                        and result.output_tokens is not None,
                        input_tokens=result.input_tokens,
                        output_tokens=result.output_tokens,
                        total_tokens=(
                            result.input_tokens + result.output_tokens
                            if result.input_tokens is not None
                            and result.output_tokens is not None
                            else None
                        ),
                        model_version=result.model_version,
                        search_calls=0,
                    ),
                )
                if clock() >= deadline:
                    raise asyncio.TimeoutError
                return completion
        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SIMULATION_DEADLINE", retryable=False
            ) from error
        except SimulationExecutionError as error:
            raise CognitiveExecutionFailure(
                error.code,
                retryable=error.code == "AXWISE_SIMULATION_PROVIDER_FAILED",
            ) from error
        except (TypeError, ValueError, OverflowError) as error:
            raise CognitiveExecutionFailure(
                "AXWISE_SIMULATION_GROUNDING_INVALID", retryable=False
            ) from error


__all__ = ["SimulationOperationHandler"]
