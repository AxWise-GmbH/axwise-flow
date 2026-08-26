"""Unified owner acceptance and current-head validation for scope proposals."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import NAMESPACE_URL, uuid5

from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from backend.domain.orchestration.enums import DecisionStatus, RoutingMode
from backend.domain.orchestration.models import (
    DecisionCreateRequestV1,
    OrchestrationDecisionV1,
)
from backend.domain.orchestration.scope_models import (
    ScopeAssignmentConsumerPayloadV1,
    ScopeContractBindingV1,
    ScopeConsumerInputsV1,
    ScopeCorrectionCompilationV1,
    ScopeContinuationBindingV1,
    ScopeContinuationRequestV1,
    ScopeExecutionConsumerPayloadV1,
    ScopePlanningConsumerPayloadV1,
    ScopePlanningDecisionProjectionV1,
    ScopePlanningProjectionRefV1,
    ScopeProposalAcceptanceRequestV1,
    ScopeProposalAcceptanceV1,
    ScopeProposalBindingV1,
    ScopeResearchAcceptanceBindingV1,
    ScopeResearchCompletionRefV1,
    ScopeStateV1,
    ScopeSynthesisConsumerPayloadV1,
)
from backend.models import OrchestrationScopeAcceptance
from backend.services.orchestration.scope_decision_projection import (
    build_scope_decision_projection,
)


PARTNER_ID = "orqaly"


@dataclass(frozen=True)
class _PlanningAuthority:
    """Exact private source and public projection sealed by one planning ref."""

    source: DecisionCreateRequestV1
    projection: ScopePlanningDecisionProjectionV1


class ScopeProposalError(ValueError):
    """Proposal is absent, stale, cross-tenant, or otherwise unacceptable."""


class StoredScopeContractStale(ScopeProposalError):
    """A persisted orchestration snapshot predates the active strict contract."""


class ScopeConsumerEnvelopeInvalid(ScopeProposalError):
    """A compact consumer delta cannot form the strict downstream request."""


class ScopeAcceptanceConflict(ValueError):
    """A first-success acceptance was replayed with changed inputs."""


def parse_stored_scope_snapshot(
    row: Any,
    *,
    label: str,
) -> tuple[OrchestrationDecisionV1, DecisionCreateRequestV1]:
    """Strictly parse one durable scope row without legacy field synthesis."""

    try:
        decision = OrchestrationDecisionV1.model_validate(row.decision_payload)
        source = DecisionCreateRequestV1.model_validate(row.input_snapshot)
    except ValidationError as exc:
        raise StoredScopeContractStale(
            f"stored {label} no longer matches the current scope contract"
        ) from exc
    return decision, source


class DecisionStore(Protocol):
    def get_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def lock_for_tenant(
        self,
        decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...


class CorrectionStore(Protocol):
    def get_for_tenant(
        self,
        correction_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def find_latest_successful(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
    ) -> Any | None: ...

    def find_active_for_source(
        self,
        partner_id: str,
        external_org_id: str,
        external_user_id: str,
        task_id: str,
        upstream_decision_id: str,
        source_scope_hash: str,
    ) -> Any | None: ...


class AcceptanceStore(Protocol):
    def get_by_proposal(
        self,
        proposal_decision_id: str,
        external_org_id: str,
        external_user_id: str,
        user_id: str,
    ) -> Any | None: ...

    def add(self, row: OrchestrationScopeAcceptance) -> None: ...
    def rollback(self) -> None: ...


def _canonical_accepted_at(value: datetime) -> str:
    value = value.astimezone(timezone.utc)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


class ScopeProposalService:
    """One proposal -> one server-issued acceptance -> JIT consumers."""

    def __init__(
        self,
        *,
        decision_store: DecisionStore,
        correction_store: CorrectionStore,
        acceptance_store: AcceptanceStore,
    ) -> None:
        self.decision_store = decision_store
        self.correction_store = correction_store
        self.acceptance_store = acceptance_store

    @staticmethod
    def _acceptance_from_row(row: Any) -> ScopeProposalAcceptanceV1:
        return ScopeProposalAcceptanceV1.model_validate(row.acceptance_payload)

    def _proposal(
        self,
        proposal_decision_id: str,
        *,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
    ) -> tuple[Any, OrchestrationDecisionV1, ScopeProposalBindingV1]:
        row = self.decision_store.get_for_tenant(
            proposal_decision_id,
            org_id,
            external_user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeProposalError("scope proposal decision was not found")
        decision, _ = parse_stored_scope_snapshot(row, label="scope proposal")
        proposal = decision.scope_proposal
        if (
            proposal is None
            or proposal.proposal_decision_id != proposal_decision_id
            or decision.scope_packet is None
            or decision.scope_packet.scope_hash != proposal.scope_hash
            or decision.scope_packet.generation != proposal.scope_generation
            or decision.scope_contract_binding is None
            or decision.scope_contract_binding.contract_hash != proposal.contract_hash
            or decision.research_job is not None
            or decision.scope_research_acceptance is not None
        ):
            raise ScopeProposalError("decision is not an immutable Gate-1 proposal")
        return row, decision, proposal

    def assert_current_head(
        self,
        proposal: ScopeProposalBindingV1,
        *,
        internal_user_id: str,
    ) -> None:
        upstream_id = (
            proposal.parent_decision_id
            if proposal.scope_generation > 0
            else proposal.proposal_decision_id
        )
        if not upstream_id:
            raise ScopeProposalError("corrected proposal lost its source decision")
        # A revision invalidates new consumers as soon as its immutable raw row
        # exists, not only after Gemini or compilation succeeds.
        active_child = self.correction_store.find_active_for_source(
            PARTNER_ID,
            proposal.org_id,
            proposal.user_id,
            proposal.task_id,
            upstream_id,
            proposal.scope_hash,
        )
        if active_child is not None:
            raise ScopeProposalError("scope proposal is superseded by a newer revision")

        if proposal.scope_generation == 0:
            return
        if proposal.correction_id is None:
            raise ScopeProposalError("corrected proposal lost correction provenance")
        correction = self.correction_store.get_for_tenant(
            proposal.correction_id,
            proposal.org_id,
            proposal.user_id,
            internal_user_id,
        )
        if (
            correction is None
            or correction.status != "compiled"
            or correction.compilation_payload is None
        ):
            raise ScopeProposalError("corrected proposal is not durably complete")
        compilation = ScopeCorrectionCompilationV1.model_validate(
            correction.compilation_payload
        )
        if (
            compilation.proposal is None
            or compilation.proposal.scope_proposal != proposal
        ):
            raise ScopeProposalError("corrected proposal contradicts its compilation")
        latest = self.correction_store.find_latest_successful(
            PARTNER_ID,
            proposal.org_id,
            proposal.user_id,
            proposal.task_id,
            upstream_id,
        )
        if latest is None or latest.correction_id != proposal.correction_id:
            raise ScopeProposalError("corrected proposal is not the current scope head")

    def accept(
        self,
        request: ScopeProposalAcceptanceRequestV1,
        *,
        internal_user_id: str,
    ) -> ScopeProposalAcceptanceV1:
        _, _, proposal = self._proposal(
            request.proposal_decision_id,
            org_id=request.org_id,
            external_user_id=request.user_id,
            internal_user_id=internal_user_id,
        )
        lock_id = proposal.parent_decision_id or proposal.proposal_decision_id
        if self.decision_store.lock_for_tenant(
            lock_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        ) is None:
            raise ScopeProposalError("scope proposal root was not found")
        # Accept, replay, and correction reservation all serialize on the same
        # immutable root decision.  In particular, a historical acceptance is
        # never replayed after a correction has made that proposal stale.
        self.assert_current_head(proposal, internal_user_id=internal_user_id)
        existing = self.acceptance_store.get_by_proposal(
            request.proposal_decision_id,
            request.org_id,
            request.user_id,
            internal_user_id,
        )
        if existing is not None:
            accepted = self._acceptance_from_row(existing)
            supplied = request.model_dump(mode="json", exclude={"version"})
            stored = accepted.model_dump(
                mode="json",
                exclude={"version", "acceptance_id", "accepted_at", "acceptance_hash"},
            )
            if supplied != stored:
                raise ScopeAcceptanceConflict(
                    "scope proposal was already accepted with different input"
                )
            return accepted

        expected = {
            "org_id": proposal.org_id,
            "user_id": proposal.user_id,
            "task_id": proposal.task_id,
            "proposal_decision_id": proposal.proposal_decision_id,
            "scope_generation": proposal.scope_generation,
            "scope_hash": proposal.scope_hash,
            "contract_hash": proposal.contract_hash,
            "proposal_hash": proposal.proposal_hash,
            "proposal_inputs_hash": proposal.proposal_inputs_hash,
            "research_execution_inputs_hash": (
                proposal.research_execution_inputs_hash
            ),
        }
        if request.model_dump(mode="json", exclude={"version"}) != expected:
            raise ScopeAcceptanceConflict(
                "scope acceptance does not match the immutable proposal"
            )
        identity = dict(expected)
        payload = {
            "version": "axwise_scope_proposal_acceptance_v1",
            "acceptance_id": ScopeProposalAcceptanceV1.canonical_acceptance_id(
                identity
            ),
            **identity,
            "accepted_at": _canonical_accepted_at(datetime.now(timezone.utc)),
        }
        payload["acceptance_hash"] = ScopeProposalAcceptanceV1.canonical_hash_for(
            payload
        )
        acceptance = ScopeProposalAcceptanceV1.model_validate(payload)
        row = OrchestrationScopeAcceptance(
            acceptance_id=acceptance.acceptance_id,
            partner_id=PARTNER_ID,
            external_org_id=acceptance.org_id,
            external_user_id=acceptance.user_id,
            user_id=internal_user_id,
            task_id=acceptance.task_id,
            proposal_decision_id=acceptance.proposal_decision_id,
            scope_generation=acceptance.scope_generation,
            scope_hash=acceptance.scope_hash,
            contract_hash=acceptance.contract_hash,
            proposal_hash=acceptance.proposal_hash,
            proposal_inputs_hash=acceptance.proposal_inputs_hash,
            research_execution_inputs_hash=(
                acceptance.research_execution_inputs_hash
            ),
            acceptance_payload=acceptance.model_dump(mode="json"),
        )
        try:
            self.acceptance_store.add(row)
        except IntegrityError:
            self.acceptance_store.rollback()
            winner = self.acceptance_store.get_by_proposal(
                request.proposal_decision_id,
                request.org_id,
                request.user_id,
                internal_user_id,
            )
            if winner is None:
                raise ScopeAcceptanceConflict(
                    "scope acceptance first-success race was not recoverable"
                )
            accepted = self._acceptance_from_row(winner)
            if accepted.model_dump(
                mode="json",
                exclude={"version", "acceptance_id", "accepted_at", "acceptance_hash"},
            ) != request.model_dump(mode="json", exclude={"version"}):
                raise ScopeAcceptanceConflict(
                    "scope proposal was concurrently accepted differently"
                )
            return accepted
        return acceptance

    def validate_acceptance(
        self,
        acceptance: ScopeProposalAcceptanceV1,
        *,
        internal_user_id: str,
    ) -> tuple[OrchestrationDecisionV1, ScopeProposalBindingV1]:
        """Lock and validate one durable current-head acceptance.

        The root lock is deliberately held by the caller's SQLAlchemy session
        until its downstream decision/job commit.  A concurrent correction
        reservation therefore cannot make the proposal stale between this
        check and enqueue.
        """

        _, decision, proposal = self._proposal(
            acceptance.proposal_decision_id,
            org_id=acceptance.org_id,
            external_user_id=acceptance.user_id,
            internal_user_id=internal_user_id,
        )
        lock_id = proposal.parent_decision_id or proposal.proposal_decision_id
        if self.decision_store.lock_for_tenant(
            lock_id,
            acceptance.org_id,
            acceptance.user_id,
            internal_user_id,
        ) is None:
            raise ScopeProposalError("scope proposal root was not found")
        self.assert_current_head(proposal, internal_user_id=internal_user_id)
        stored_row = self.acceptance_store.get_by_proposal(
            acceptance.proposal_decision_id,
            acceptance.org_id,
            acceptance.user_id,
            internal_user_id,
        )
        if stored_row is None or self._acceptance_from_row(stored_row) != acceptance:
            raise ScopeAcceptanceConflict(
                "scope proposal acceptance is absent or does not match the durable winner"
            )
        if (
            acceptance.task_id != proposal.task_id
            or acceptance.scope_generation != proposal.scope_generation
            or acceptance.scope_hash != proposal.scope_hash
            or acceptance.contract_hash != proposal.contract_hash
            or acceptance.proposal_hash != proposal.proposal_hash
            or acceptance.proposal_inputs_hash != proposal.proposal_inputs_hash
            or acceptance.research_execution_inputs_hash
            != proposal.research_execution_inputs_hash
        ):
            raise ScopeAcceptanceConflict(
                "scope proposal acceptance contradicts its immutable proposal"
            )
        return decision, proposal

    def continuation(
        self,
        request: ScopeContinuationRequestV1,
        *,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
    ) -> ScopeContinuationBindingV1:
        """Mint a deterministic single-purpose capability from one acceptance."""

        row = self.acceptance_store.get_by_proposal(
            request.proposal_decision_id,
            org_id,
            external_user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeProposalError("scope proposal is not durably accepted")
        acceptance = self._acceptance_from_row(row)
        if (
            request.acceptance_id != acceptance.acceptance_id
            or request.acceptance_hash != acceptance.acceptance_hash
        ):
            raise ScopeAcceptanceConflict(
                "continuation does not match the durable proposal acceptance"
            )
        _, proposal = self.validate_acceptance(
            acceptance,
            internal_user_id=internal_user_id,
        )
        consumer = request.consumer_inputs
        if (
            consumer.task_id != proposal.task_id
            or consumer.scope_hash != proposal.scope_hash
            or consumer.scope_generation != proposal.scope_generation
        ):
            raise ScopeAcceptanceConflict(
                "continuation consumer inputs contradict the accepted scope"
            )
        payload = {
            "version": "axwise_scope_continuation_v1",
            "org_id": proposal.org_id,
            "user_id": proposal.user_id,
            "task_id": proposal.task_id,
            "proposal_decision_id": proposal.proposal_decision_id,
            "proposal_hash": proposal.proposal_hash,
            "acceptance_id": acceptance.acceptance_id,
            "acceptance_hash": acceptance.acceptance_hash,
            "scope_hash": proposal.scope_hash,
            "scope_generation": proposal.scope_generation,
            "correction_id": proposal.correction_id,
            "purpose": consumer.purpose,
            "consumer_inputs_hash": consumer.consumer_inputs_hash,
        }
        payload["binding_hash"] = ScopeContinuationBindingV1.canonical_hash_for(payload)
        binding = ScopeContinuationBindingV1.model_validate(payload)
        # Mint is an authority boundary even when Orqaly consumes the result
        # itself. Validate the exact compact delta against AxWise's sealed
        # proposal before returning this deliberately non-authorizing token.
        self.validate_consumer(
            binding,
            acceptance,
            consumer,
            internal_user_id=internal_user_id,
        )
        return binding

    def research_completion_ref(
        self,
        *,
        proposal_decision_id: str,
        result_decision_id: str,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
    ) -> ScopeResearchCompletionRefV1:
        """Mint a compact proof from a durable usable research refresh result."""

        acceptance = self.accepted_for_proposal(
            proposal_decision_id,
            org_id=org_id,
            external_user_id=external_user_id,
            internal_user_id=internal_user_id,
        )
        _, _, proposal = self._proposal(
            proposal_decision_id,
            org_id=org_id,
            external_user_id=external_user_id,
            internal_user_id=internal_user_id,
        )
        receipt, _ = self._research_completion_from_result(
            result_decision_id=result_decision_id,
            proposal=proposal,
            acceptance=acceptance,
            internal_user_id=internal_user_id,
        )
        return receipt

    def _research_completion_from_result(
        self,
        *,
        result_decision_id: str,
        proposal: ScopeProposalBindingV1,
        acceptance: ScopeProposalAcceptanceV1,
        internal_user_id: str,
    ) -> tuple[ScopeResearchCompletionRefV1, DecisionCreateRequestV1]:
        result_row = self.decision_store.get_for_tenant(
            result_decision_id,
            proposal.org_id,
            proposal.user_id,
            internal_user_id,
        )
        if result_row is None:
            raise ScopeProposalError("research result decision was not found")
        result_decision, result_source = parse_stored_scope_snapshot(
            result_row,
            label="research result",
        )
        result_job = result_decision.research_job
        research_decision_id = result_decision.parent_decision_id
        if (
            result_job is None
            or result_job.status not in {"completed", "partial"}
            or not research_decision_id
            or result_job.decision_id != research_decision_id
        ):
            raise ScopeProposalError("research result is not a usable completed refresh")
        research_row = self.decision_store.get_for_tenant(
            research_decision_id,
            proposal.org_id,
            proposal.user_id,
            internal_user_id,
        )
        if research_row is None:
            raise ScopeProposalError("research dispatch decision was not found")
        research_decision, research_source = parse_stored_scope_snapshot(
            research_row,
            label="research dispatch",
        )
        if (
            research_decision.parent_decision_id != proposal.proposal_decision_id
            or research_decision.research_job is None
            or research_decision.research_job.job_id != result_job.job_id
            or research_decision.research_job.decision_id != research_decision_id
            or result_decision.task_id != proposal.task_id
            or research_decision.task_id != proposal.task_id
            or result_source.task.task_id != proposal.task_id
            or research_source.task.task_id != proposal.task_id
            or result_source.tenant.org_id != proposal.org_id
            or research_source.tenant.org_id != proposal.org_id
            or result_source.tenant.user_id != proposal.user_id
            or research_source.tenant.user_id != proposal.user_id
        ):
            raise ScopeProposalError("research result does not descend from the proposal")

        result_packet = result_source.scope_packet
        research_packet = research_source.scope_packet
        if (
            result_packet is None
            or research_packet is None
            or result_packet != research_packet
        ):
            raise ScopeProposalError("research result changed its exact accepted packet")
        expected_binding = ScopeContractBindingV1.from_packet(research_packet)
        if (
            research_decision.scope_contract_binding != expected_binding
            or result_decision.scope_contract_binding != expected_binding
            or research_decision.research_job.scope_contract_binding
            != expected_binding
            or result_job.scope_contract_binding != expected_binding
            or research_decision.scope_runtime_binding != research_packet.runtime
            or result_decision.scope_runtime_binding != research_packet.runtime
            or research_decision.research_job.scope_runtime_binding
            != research_packet.runtime
            or result_job.scope_runtime_binding != research_packet.runtime
        ):
            raise ScopeProposalError(
                "research result lost its exact scope or runtime binding echoes"
            )

        def exact_research_capability(request: DecisionCreateRequestV1) -> bool:
            continuation = request.scope_continuation
            consumer = request.scope_consumer_inputs
            return bool(
                request.scope_packet is not None
                and request.scope_packet.scope_hash == proposal.scope_hash
                and request.scope_packet.generation == proposal.scope_generation
                and request.task.task_id == proposal.task_id
                and request.tenant.org_id == proposal.org_id
                and request.tenant.user_id == proposal.user_id
                and request.upstream_decision_id == proposal.proposal_decision_id
                and request.scope_proposal_acceptance == acceptance
                and continuation is not None
                and continuation.purpose == "research"
                and continuation.org_id == proposal.org_id
                and continuation.user_id == proposal.user_id
                and continuation.task_id == proposal.task_id
                and continuation.proposal_decision_id
                == proposal.proposal_decision_id
                and continuation.proposal_hash == proposal.proposal_hash
                and continuation.acceptance_id == acceptance.acceptance_id
                and continuation.acceptance_hash == acceptance.acceptance_hash
                and continuation.scope_hash == proposal.scope_hash
                and continuation.scope_generation == proposal.scope_generation
                and continuation.correction_id == proposal.correction_id
                and consumer is not None
                and consumer.purpose == "research"
                and consumer.task_id == proposal.task_id
                and consumer.scope_hash == proposal.scope_hash
                and consumer.scope_generation == proposal.scope_generation
                and continuation.consumer_inputs_hash
                == consumer.consumer_inputs_hash
            )

        if not exact_research_capability(research_source) or not exact_research_capability(
            result_source
        ):
            raise ScopeProposalError("research result lost its exact accepted capability")
        evidence_payload = [
            item.model_dump(mode="json") for item in result_source.evidence_catalogue
        ]
        if not evidence_payload:
            raise ScopeProposalError("research completion contains no usable evidence")
        payload: dict[str, Any] = {
            "version": "axwise_scope_research_completion_ref_v1",
            "org_id": proposal.org_id,
            "user_id": proposal.user_id,
            "task_id": proposal.task_id,
            "proposal_decision_id": proposal.proposal_decision_id,
            "proposal_hash": proposal.proposal_hash,
            "acceptance_id": acceptance.acceptance_id,
            "acceptance_hash": acceptance.acceptance_hash,
            "scope_hash": proposal.scope_hash,
            "research_decision_id": research_decision_id,
            "result_decision_id": result_decision_id,
            "research_job_id": result_job.job_id,
            "research_status": result_job.status,
            "research_continuation_binding_hash": (
                research_source.scope_continuation.binding_hash
            ),
            "research_consumer_inputs_hash": (
                research_source.scope_consumer_inputs.consumer_inputs_hash
            ),
            "evidence_catalogue_hash": ScopeConsumerInputsV1.canonical_hash_for(
                evidence_payload
            ),
            "evidence_count": len(evidence_payload),
        }
        payload["completion_id"] = ScopeResearchCompletionRefV1.canonical_id_for(
            payload
        )
        payload["completion_hash"] = (
            ScopeResearchCompletionRefV1.canonical_hash_for(payload)
        )
        return ScopeResearchCompletionRefV1.model_validate(payload), result_source

    def _planning_authority_from_ref(
        self,
        planning_ref: ScopePlanningProjectionRefV1,
        *,
        proposal: ScopeProposalBindingV1,
        acceptance: ScopeProposalAcceptanceV1,
        packet: Any,
        internal_user_id: str,
    ) -> _PlanningAuthority:
        row = self.decision_store.get_for_tenant(
            planning_ref.planning_decision_id,
            proposal.org_id,
            proposal.user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeProposalError("planning projection decision was not found")
        decision, source = parse_stored_scope_snapshot(
            row,
            label="planning projection",
        )
        continuation = source.scope_continuation
        consumer = source.scope_consumer_inputs
        if (
            decision.parent_decision_id != proposal.proposal_decision_id
            or decision.task_id != proposal.task_id
            or decision.scope_packet != packet
            or source.upstream_decision_id != proposal.proposal_decision_id
            or source.task.task_id != proposal.task_id
            or source.tenant.org_id != proposal.org_id
            or source.tenant.user_id != proposal.user_id
            or source.scope_packet != packet
            or source.scope_proposal_acceptance != acceptance
            or source.planning is None
            or continuation is None
            or continuation.purpose != "planning"
            or continuation.org_id != proposal.org_id
            or continuation.user_id != proposal.user_id
            or continuation.task_id != proposal.task_id
            or continuation.proposal_decision_id != proposal.proposal_decision_id
            or continuation.proposal_hash != proposal.proposal_hash
            or continuation.acceptance_id != acceptance.acceptance_id
            or continuation.acceptance_hash != acceptance.acceptance_hash
            or continuation.scope_hash != proposal.scope_hash
            or continuation.scope_generation != proposal.scope_generation
            or continuation.correction_id != proposal.correction_id
            or consumer is None
            or consumer.purpose != "planning"
            or consumer.task_id != proposal.task_id
            or consumer.scope_hash != proposal.scope_hash
            or consumer.scope_generation != proposal.scope_generation
            or continuation.consumer_inputs_hash != consumer.consumer_inputs_hash
            or planning_ref.planning_continuation_binding_hash
            != continuation.binding_hash
            or planning_ref.planning_consumer_inputs_hash
            != consumer.consumer_inputs_hash
        ):
            raise ScopeProposalError("planning projection reference lost its exact scope")
        projection = build_scope_decision_projection(decision, "planning")
        if not isinstance(projection, ScopePlanningDecisionProjectionV1):
            raise ScopeProposalError("planning projection payload is invalid")
        if planning_ref.planning_projection_hash != projection.projection_hash:
            raise ScopeProposalError("planning projection hash is stale or tampered")
        planning_payload = consumer.payload
        if not isinstance(planning_payload, ScopePlanningConsumerPayloadV1):
            raise ScopeProposalError("planning projection payload is invalid")
        completion = planning_payload.research_completion_ref
        research_required = packet.research_contract.evidence.mode != "none"
        if research_required:
            if completion is None:
                raise ScopeProposalError(
                    "research-backed planning lost its completion reference"
                )
            expected_completion, _ = self._research_completion_from_result(
                result_decision_id=completion.result_decision_id,
                proposal=proposal,
                acceptance=acceptance,
                internal_user_id=internal_user_id,
            )
            if completion != expected_completion:
                raise ScopeProposalError(
                    "planning research completion reference is stale or tampered"
                )
        elif completion is not None:
            raise ScopeProposalError(
                "no-research planning cannot claim a research completion"
            )
        if (
            not projection.executable
            or projection.validation_status != "feasible"
            or decision.status != DecisionStatus.RECOMMENDED
            or decision.routing_mode
            not in {
                RoutingMode.DIRECT,
                RoutingMode.EVIDENCE_ASSISTED,
                RoutingMode.RESEARCH_ASSISTED,
                RoutingMode.SEQUENTIAL,
                RoutingMode.PARALLEL,
                RoutingMode.SUPERVISOR,
            }
        ):
            raise ScopeProposalError(
                "planning projection is not executable, feasible, and assignable"
            )
        return _PlanningAuthority(source=source, projection=projection)

    def validate_consumer(
        self,
        binding: ScopeContinuationBindingV1,
        acceptance: ScopeProposalAcceptanceV1,
        consumer: ScopeConsumerInputsV1,
        *,
        internal_user_id: str,
    ) -> tuple[
        OrchestrationDecisionV1,
        DecisionCreateRequestV1,
        Any,
        DecisionCreateRequestV1 | None,
    ]:
        """Validate one exact purpose payload against the accepted scope.

        Synthesis and execution return only a preflight capability. Execution
        never claims approval: Orqaly must bind this exact continuation and
        consumer-input hash to a later, succeeded Gate-2 attempt.
        """

        self.validate_continuation(
            binding,
            consumer,
            acceptance,
            internal_user_id=internal_user_id,
        )

        row = self.decision_store.get_for_tenant(
            acceptance.proposal_decision_id,
            acceptance.org_id,
            acceptance.user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeProposalError("scope proposal decision was not found")
        decision, source = parse_stored_scope_snapshot(
            row,
            label="scope proposal",
        )
        packet = decision.scope_packet
        if packet is None or decision.scope_proposal is None:
            raise ScopeProposalError("scope proposal lost its sealed request")
        purpose = consumer.purpose
        if packet.research_contract is None:
            raise ScopeProposalError("consumer requires a typed research contract")
        staged_source: DecisionCreateRequestV1 | None = None
        if purpose == "planning":
            planning_payload = consumer.payload
            if not isinstance(planning_payload, ScopePlanningConsumerPayloadV1):
                raise ScopeProposalError("planning payload schema is invalid")
            completion = planning_payload.research_completion_ref
            research_required = packet.research_contract.evidence.mode != "none"
            if research_required and completion is None:
                raise ScopeProposalError(
                    "planning requires a usable research completion reference"
                )
            if not research_required and completion is not None:
                raise ScopeProposalError(
                    "no-research planning cannot claim a research completion"
                )
            if completion is not None:
                expected, staged_source = self._research_completion_from_result(
                    result_decision_id=completion.result_decision_id,
                    proposal=decision.scope_proposal,
                    acceptance=acceptance,
                    internal_user_id=internal_user_id,
                )
                if completion != expected:
                    raise ScopeProposalError(
                        "planning research completion reference is stale or tampered"
                    )
        elif purpose == "assignment":
            assignment_payload = consumer.payload
            if not isinstance(assignment_payload, ScopeAssignmentConsumerPayloadV1):
                raise ScopeProposalError("assignment payload schema is invalid")
            authority = self._planning_authority_from_ref(
                assignment_payload.planning_projection_ref,
                proposal=decision.scope_proposal,
                acceptance=acceptance,
                packet=packet,
                internal_user_id=internal_user_id,
            )
            staged_source = authority.source
        if purpose == "synthesis":
            synthesis = consumer.payload
            if not isinstance(synthesis, ScopeSynthesisConsumerPayloadV1):
                raise ScopeProposalError("synthesis payload schema is invalid")
            expected_output = {
                "type": packet.deliverable.type,
                "count": packet.deliverable.count,
                "title_prefix": packet.deliverable.title_prefix,
                "required_sections": list(packet.deliverable.required_sections),
                "presentation": packet.deliverable.presentation,
            }
            if synthesis.output_contract.model_dump(mode="json") != expected_output:
                raise ScopeProposalError(
                    "synthesis output_contract expands or contradicts the accepted deliverable"
                )
            return decision, source, packet, staged_source
        if purpose == "execution":
            execution = consumer.payload
            if not isinstance(execution, ScopeExecutionConsumerPayloadV1):
                raise ScopeProposalError("execution payload schema is invalid")
            authority = self._planning_authority_from_ref(
                execution.planning_projection_ref,
                proposal=decision.scope_proposal,
                acceptance=acceptance,
                packet=packet,
                internal_user_id=internal_user_id,
            )
            projected_nodes = {
                node.node_id: node for node in authority.projection.nodes
            }
            action_nodes = {
                action.plan_node_id for action in execution.action_inputs
            }
            if (
                len(execution.action_inputs) != len(projected_nodes)
                or action_nodes != set(projected_nodes)
            ):
                raise ScopeProposalError(
                    "execution action_inputs must exactly cover planning "
                    "projection nodes"
                )
            for action_input in execution.action_inputs:
                node = projected_nodes[action_input.plan_node_id]
                if action_input.agent_id != node.assigned_agent_id:
                    raise ScopeProposalError(
                        "execution agent_id does not match its planning projection node"
                    )
                if action_input.tool_grant_ids != node.tool_ids:
                    raise ScopeProposalError(
                        "execution tool_grant_ids do not exactly match their "
                        "planning projection node"
                    )
                if action_input.tool_action_grants != node.tool_action_grants:
                    raise ScopeProposalError(
                        "execution tool_action_grants do not exactly match their "
                        "planning projection node"
                    )
                if (
                    len(action_input.input_refs) != 1
                    or action_input.input_refs[0].reference_type
                    != "structured_input"
                ):
                    raise ScopeProposalError(
                        "execution requires one structured_input ref per "
                        "planning projection node"
                    )
                expected_input_hash = ScopeConsumerInputsV1.canonical_hash_for(
                    node.input_contract
                )
                if action_input.input_refs[0].content_hash != expected_input_hash:
                    raise ScopeProposalError(
                        "execution structured_input hash does not match its "
                        "planning projection node"
                    )
            return decision, source, packet, staged_source
        return decision, source, packet, staged_source

    def consumer_request(
        self,
        binding: ScopeContinuationBindingV1,
        acceptance: ScopeProposalAcceptanceV1,
        consumer: ScopeConsumerInputsV1,
        *,
        internal_user_id: str,
    ) -> DecisionCreateRequestV1:
        """Overlay planning/assignment/research data on the sealed proposal."""

        decision, source, packet, staged_source = self.validate_consumer(
            binding,
            acceptance,
            consumer,
            internal_user_id=internal_user_id,
        )
        purpose = consumer.purpose
        if purpose in {"synthesis", "execution"}:
            raise ScopeProposalError(
                f"{purpose} is a preflight capability, not a decision request"
            )
        compact = consumer.payload_dict
        catalogue = compact.get("catalogue", {})
        if not isinstance(catalogue, dict) or not set(catalogue).issubset(
            {"available_agents", "available_tools"}
        ):
            raise ScopeProposalError("consumer catalogue shape is invalid")
        if purpose == "planning" and "planning" not in compact:
            raise ScopeProposalError("planning consumer requires a typed plan")
        planning = (
            staged_source.planning
            if purpose == "assignment" and staged_source is not None
            else compact.get("planning")
        )
        if purpose == "assignment" and planning is None:
            raise ScopeProposalError(
                "assignment requires its exact prior planning projection"
            )
        available_agents = (
            source.available_agents
            if purpose == "research"
            else catalogue.get("available_agents", [])
        )
        available_tools = (
            source.available_tools
            if purpose == "research"
            else catalogue.get("available_tools", [])
        )
        available_agents_payload = (
            [item.model_dump(mode="json") for item in available_agents]
            if purpose == "research"
            else available_agents
        )
        available_tools_payload = (
            [item.model_dump(mode="json") for item in available_tools]
            if purpose == "research"
            else available_tools
        )
        policy = (
            staged_source.research_policy
            if staged_source is not None
            else source.research_policy
        )
        if purpose == "research":
            # The proposal packet, rather than the source request's advertised
            # output catalogue, is the accepted research authority.  This
            # projection is hash-preserving because research execution inputs
            # are already sealed from the packet's required outputs.
            policy = policy.model_copy(
                update={
                    "required_outputs": list(
                        packet.research_contract.evidence.required_outputs
                    )
                }
            )
        else:
            policy = policy.model_copy(
                update={
                    "required": False,
                    "grounding_required": False,
                    "minimum_mode": "instant",
                    "required_outputs": [],
                }
            )
        state = source.scope_state or ScopeStateV1()
        state = state.model_copy(
            update={
                "admission": packet.admission,
                "deliverable": packet.deliverable,
                "research_contract": packet.research_contract,
            }
        )
        payload = source.model_dump(mode="json")
        payload.update(
            {
                "upstream_decision_id": acceptance.proposal_decision_id,
                "task": source.task.model_copy(
                    update={"requested_actions": []}
                ).model_dump(mode="json"),
                "available_agents": available_agents_payload,
                "available_tools": available_tools_payload,
                "evidence_catalogue": [
                    item.model_dump(mode="json")
                    for item in (
                        staged_source.evidence_catalogue
                        if staged_source is not None
                        else source.evidence_catalogue
                    )
                ],
                "research_policy": policy.model_dump(mode="json"),
                "planning": (
                    planning.model_dump(mode="json")
                    if hasattr(planning, "model_dump")
                    else planning
                ),
                "scope_state": state.model_dump(mode="json"),
                "scope_packet": packet.model_dump(mode="json"),
                "scope_research_acceptance": None,
                "scope_proposal_acceptance": acceptance.model_dump(mode="json"),
                "scope_continuation": binding.model_dump(mode="json"),
                "scope_consumer_inputs": consumer.model_dump(mode="json"),
            }
        )
        try:
            request = DecisionCreateRequestV1.model_validate(payload)
        except ValidationError as exc:
            raise ScopeConsumerEnvelopeInvalid(
                "compact scope consumer envelope does not match the current contract"
            ) from exc
        from backend.services.orchestration.scope_correction_service import (
            validate_continuation_request_authority,
        )

        validate_continuation_request_authority(request, packet)
        return request

    def accepted_for_proposal(
        self,
        proposal_decision_id: str,
        *,
        org_id: str,
        external_user_id: str,
        internal_user_id: str,
    ) -> ScopeProposalAcceptanceV1:
        row = self.acceptance_store.get_by_proposal(
            proposal_decision_id,
            org_id,
            external_user_id,
            internal_user_id,
        )
        if row is None:
            raise ScopeProposalError("scope proposal is not durably accepted")
        acceptance = self._acceptance_from_row(row)
        self.validate_acceptance(acceptance, internal_user_id=internal_user_id)
        return acceptance

    def validate_continuation(
        self,
        binding: ScopeContinuationBindingV1,
        consumer_inputs: ScopeConsumerInputsV1,
        acceptance: ScopeProposalAcceptanceV1,
        *,
        internal_user_id: str,
    ) -> tuple[OrchestrationDecisionV1, ScopeProposalBindingV1]:
        """Revalidate a minted capability immediately before downstream use."""

        decision, proposal = self.validate_acceptance(
            acceptance,
            internal_user_id=internal_user_id,
        )
        expected = {
            "org_id": proposal.org_id,
            "user_id": proposal.user_id,
            "task_id": proposal.task_id,
            "proposal_decision_id": proposal.proposal_decision_id,
            "proposal_hash": proposal.proposal_hash,
            "acceptance_id": acceptance.acceptance_id,
            "acceptance_hash": acceptance.acceptance_hash,
            "scope_hash": proposal.scope_hash,
            "scope_generation": proposal.scope_generation,
            "correction_id": proposal.correction_id,
            "purpose": consumer_inputs.purpose,
            "consumer_inputs_hash": consumer_inputs.consumer_inputs_hash,
        }
        supplied = binding.model_dump(
            mode="json", exclude={"version", "binding_hash"}
        )
        if supplied != expected:
            raise ScopeAcceptanceConflict(
                "scope continuation does not match its current accepted proposal"
            )
        if binding.binding_hash != ScopeContinuationBindingV1.canonical_hash_for(
            binding.model_dump(mode="json", exclude={"binding_hash"})
        ):
            raise ScopeAcceptanceConflict("scope continuation hash is invalid")
        return decision, proposal

    @staticmethod
    def research_acceptance(
        acceptance: ScopeProposalAcceptanceV1,
    ) -> ScopeResearchAcceptanceBindingV1:
        if acceptance.research_execution_inputs_hash is None:
            raise ScopeProposalError("accepted scope does not authorize research")
        payload = {
            "version": "orqaly_scope_research_acceptance_v1",
            "org_id": acceptance.org_id,
            "user_id": acceptance.user_id,
            "goal_id": acceptance.task_id,
            "proposal_decision_id": acceptance.proposal_decision_id,
            "scope_hash": acceptance.scope_hash,
            "contract_hash": acceptance.contract_hash,
            "execution_inputs_hash": acceptance.research_execution_inputs_hash,
            "acceptance_id": str(uuid5(NAMESPACE_URL, acceptance.acceptance_id)),
            "accepted_at": acceptance.accepted_at,
            "accepted_by_user_id": acceptance.user_id,
        }
        payload["binding_hash"] = ScopeResearchAcceptanceBindingV1.canonical_hash_for(
            payload
        )
        return ScopeResearchAcceptanceBindingV1.model_validate(payload)


__all__ = [
    "ScopeAcceptanceConflict",
    "ScopeProposalError",
    "ScopeProposalService",
]
